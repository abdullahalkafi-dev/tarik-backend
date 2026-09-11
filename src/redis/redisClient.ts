import { createClient, RedisClientType } from "./redisPackage";
import config from "../config";
import { logger } from "../logger/logger";

class RedisClient {
  private clientInstance: RedisClientType;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private retryCount = 0;
  private maxRetries = 3;
  private retryDelay = 1000;
  private lastError: string | null = null;
  private hasGivenUpOnRedis = false;

  constructor() {
    this.clientInstance = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
      password: config.redis.password || undefined,
      socket: {
        connectTimeout: 5000,
        noDelay: true,
        reconnectStrategy: (retries: number) => {
          if (this.hasGivenUpOnRedis) return false;

          this.retryCount = retries;

          if (this.retryCount >= this.maxRetries) {
            this.hasGivenUpOnRedis = true;
            return false;
          }

          return Math.min(Math.pow(2, this.retryCount) * this.retryDelay, 5000);
        },
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.clientInstance.on("error", (err: Error) => {
      if (!this.hasGivenUpOnRedis) {
        logger.warn(`Redis client error: ${err.message}`);
      }
      this.isConnected = false;
      this.lastError = err.message;
    });

    this.clientInstance.on("connect", () => {
      this.isConnected = true;
      this.retryCount = 0;
      this.hasGivenUpOnRedis = false;
      this.lastError = null;
    });

    this.clientInstance.on("ready", () => {
      logger.info("Redis client ready");
      this.isConnected = true;
      this.lastError = null;
    });

    this.clientInstance.on("disconnect", () => {
      this.isConnected = false;
    });
  }

  get client(): RedisClientType {
    return this.clientInstance;
  }

  isAvailable(): boolean {
    return this.isConnected && this.clientInstance.isReady;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.attemptConnection();

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async attemptConnection(): Promise<void> {
    try {
      await this.clientInstance.connect();
      logger.info("Connected to Redis");
      this.lastError = null;
    } catch (error) {
      this.isConnected = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async ensureConnected(): Promise<void> {
    if (!config.cache.enabled) throw new Error("Redis cache is disabled");
    if (!this.isConnected) await this.connect();
  }

  async disconnect(): Promise<void> {
    if (this.clientInstance.isOpen) {
      await this.clientInstance.disconnect();
    }
    this.isConnected = false;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!config.cache.enabled) return true;
      if (!this.clientInstance.isOpen) return false;
      await this.ensureConnected();
      await this.clientInstance.ping();
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async set(key: string, value: string, expiryInSec = 3600): Promise<void> {
    if (this.hasGivenUpOnRedis || !this.isAvailable()) {
      throw new Error("Redis unavailable");
    }
    if (!this.isConnected) await this.ensureConnected();
    await this.clientInstance.setEx(key, expiryInSec, value);
  }

  async setNX(key: string, value: string, expiryInSec = 86400): Promise<boolean> {
    if (this.hasGivenUpOnRedis || !this.isAvailable()) {
      return true; // fail-open if redis is unavailable
    }
    if (!this.isConnected) await this.ensureConnected();
    const result = await this.clientInstance.set(key, value, {
      EX: expiryInSec,
      NX: true,
    });
    return result === "OK";
  }

  async get(key: string): Promise<string | null> {
    if (this.hasGivenUpOnRedis || !this.isAvailable()) {
      throw new Error("Redis unavailable");
    }
    if (!this.isConnected) await this.ensureConnected();
    return this.clientInstance.get(key);
  }

  async delete(key: string): Promise<void> {
    if (this.hasGivenUpOnRedis || !this.isAvailable()) {
      throw new Error("Redis unavailable");
    }
    if (!this.isConnected) await this.ensureConnected();
    await this.clientInstance.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    if (this.hasGivenUpOnRedis || !this.isAvailable()) {
      throw new Error("Redis unavailable");
    }
    if (!this.isConnected) await this.ensureConnected();
    return this.clientInstance.keys(pattern);
  }
}

const redisClient = new RedisClient();

export default redisClient;
