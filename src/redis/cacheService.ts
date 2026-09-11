import redisClient from "./redisClient";
import { promisify } from "../util/nodeUtil";
import { deflate, inflate } from "zlib";
import { logger } from "../logger/logger";
import config from "config";

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

class CacheService {
  private readonly COMPRESSION_THRESHOLD = 1024;
  private readonly MAX_CACHE_SIZE = 10 * 1024 * 1024;
  private readonly COMPRESSED_PREFIX = "GZ:";

  private isEnabled() {
    return config.cache.enabled;
  }

  private async compress(data: string): Promise<string> {
    const buffer = Buffer.from(data, "utf-8");
    const compressed = await deflateAsync(buffer, { level: 1 });
    return this.COMPRESSED_PREFIX + compressed.toString("base64");
  }

  private async decompress(data: string): Promise<string> {
    if (!data.startsWith(this.COMPRESSED_PREFIX)) return data;
    const compressedData = data.slice(this.COMPRESSED_PREFIX.length);
    const buffer = Buffer.from(compressedData, "base64");
    const decompressed = await inflateAsync(buffer);
    return decompressed.toString("utf-8");
  }

  async setCache(key: string, value: unknown, expiryInSec = 3600): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const stringified = JSON.stringify(value);
      const finalValue =
        stringified.length > this.COMPRESSION_THRESHOLD
          ? await this.compress(stringified)
          : stringified;

      if (finalValue.length > this.MAX_CACHE_SIZE) {
        logger.warn(`Cache too large, skipping: ${key}`);
        return false;
      }

      await redisClient.set(key, finalValue, expiryInSec);
      return true;
    } catch {
      logger.warn(`Cache set skipped for key ${key}`);
      return false;
    }
  }

  async getCache<T>(key: string): Promise<T | null> {
    if (!this.isEnabled()) return null;

    try {
      const data = await redisClient.get(key);
      if (data) {
        const decompressed = await this.decompress(data);
        return JSON.parse(decompressed) as T;
      }
      return null;
    } catch {
      logger.warn(`Cache get skipped for key ${key}`);
      return null;
    }
  }

  async deleteCache(key: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      await redisClient.delete(key);
      return true;
    } catch {
      logger.warn(`Cache delete skipped for key ${key}`);
      return false;
    }
  }

  async invalidateByPattern(pattern: string): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      await redisClient.ensureConnected();
      const keys: string[] = [];
      let cursor = 0;

      do {
        const reply = await redisClient.client.scan(String(cursor), {
          MATCH: pattern,
          COUNT: 100,
        });
        cursor = Number(reply.cursor);
        keys.push(...reply.keys);
      } while (cursor !== 0);

      if (keys.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          const pipeline = redisClient.client.multi();
          batch.forEach((key) => pipeline.del(key));
          await pipeline.exec();
        }
      }

      return keys.length > 0;
    } catch {
      logger.warn(`Cache invalidation skipped for pattern ${pattern}`);
      return false;
    }
  }

  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    expiryInSec = 3600,
  ): Promise<T> {
    const cached = await this.getCache<T>(key);
    if (cached !== null) return cached;

    const value = await loader();
    await this.setCache(key, value, expiryInSec);
    return value;
  }

  async healthCheck(): Promise<boolean> {
    return redisClient.healthCheck();
  }
}

export default new CacheService();
