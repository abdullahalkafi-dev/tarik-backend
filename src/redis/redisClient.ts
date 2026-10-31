import { createClient, RedisClientType } from "./redisPackage";
import config from "../config";
import { logger } from "../logger/logger";

/** How long boot waits for the first Redis connection before continuing without it. */
const INITIAL_CONNECT_WAIT_MS = 5000;

class RedisClient {
  private clientInstance: RedisClientType;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private lastError: string | null = null;
  private lastLoggedErrorAt = 0;

  constructor() {
    this.clientInstance = createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`,
      password: config.redis.password || undefined,
      socket: {
        connectTimeout: 5000,
        noDelay: true,
        // Never give up: a short Redis restart must not need an API restart.
        // Back-off grows from 0.5 s up to a 10 s ceiling.
        reconnectStrategy: (retries: number) => Math.min(500 * Math.pow(2, Math.min(retries, 5)), 10000),
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.clientInstance.on("error", (err: Error) => {
      this.isConnected = false;
      this.lastError = err.message;
      // Avoid flooding the log while Redis is down (one line per 30 s).
      const now = Date.now();
      if (now - this.lastLoggedErrorAt > 30000) {
        this.lastLoggedErrorAt = now;
        logger.warn(`Redis client error: ${err.message}`);
      }
    });

    this.clientInstance.on("connect", () => {
      this.lastError = null;
    });

    this.clientInstance.on("ready", () => {
      logger.info("Redis client ready");
      this.isConnected = true;
      this.lastError = null;
    });

    this.clientInstance.on("end", () => {
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

  /**
   * Start the connection. Resolves as soon as Redis is ready OR after a short
   * wait, whichever is first; if Redis is still down the client keeps retrying
   * in the background and the API starts in "degraded" mode.
   */
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
    if (this.clientInstance.isOpen) return;

    const connecting = this.clientInstance.connect().then(() => undefined);
    // The pending connect() keeps retrying forever; swallow its rejection so a
    // late failure is never an unhandled rejection.
    connecting.catch((error) => {
      this.lastError = error instanceof Error ? error.message : String(error);
    });

    await Promise.race([
      connecting,
      new Promise<void>((resolve) => setTimeout(resolve, INITIAL_CONNECT_WAIT_MS)),
    ]);

    if (!this.isAvailable()) {
      logger.warn("Redis not reachable yet — continuing in degraded mode, retrying in background");
    }
  }

  async ensureConnected(): Promise<void> {
    if (!config.cache.enabled) throw new Error("Redis cache is disabled");
    if (!this.isAvailable()) throw new Error("Redis unavailable");
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
      if (!this.clientInstance.isOpen || !this.isAvailable()) return false;
      await this.clientInstance.ping();
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async set(key: string, value: string, expiryInSec = 3600): Promise<void> {
    if (!this.isAvailable()) throw new Error("Redis unavailable");
    await this.clientInstance.setEx(key, expiryInSec, value);
  }

  async setNX(key: string, value: string, expiryInSec = 86400): Promise<boolean> {
    if (!this.isAvailable()) {
      return true; // fail-open if redis is unavailable
    }
    const result = await this.clientInstance.set(key, value, {
      EX: expiryInSec,
      NX: true,
    });
    return result === "OK";
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable()) throw new Error("Redis unavailable");
    return this.clientInstance.get(key);
  }

  async delete(key: string): Promise<void> {
    if (!this.isAvailable()) throw new Error("Redis unavailable");
    await this.clientInstance.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.isAvailable()) throw new Error("Redis unavailable");
    return this.clientInstance.keys(pattern);
  }

  /**
   * Atomic "count in a fixed window": returns the new counter value and makes
   * sure the key always carries a TTL (the first hit creates it).
   */
  async incrWithWindow(key: string, windowSeconds: number): Promise<number> {
    if (!this.isAvailable()) throw new Error("Redis unavailable");
    await this.clientInstance.set(key, "0", { EX: windowSeconds, NX: true });
    return this.clientInstance.incr(key);
  }
}

const redisClient = new RedisClient();

export default redisClient;
