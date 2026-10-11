import redisClient from "../redis/redisClient";
import { logger } from "../logger/logger";
import { getSocketServer } from "./socket.gateway";

export type THelperLocationPing = {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  jobId?: string;
};

export type TLiveHelperData = {
  helperId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  jobId?: string;
  updatedAt: number;
};

const GEO_KEY = "active_helpers:geo";
const META_KEY_PREFIX = "active_helpers:meta:";
const TTL_SECONDS = 300; // 5 minutes inactivity TTL

export const getTrackingRoom = (jobId: string) => {
  return `tracking:${jobId}`;
};

export const SocketTrackingService = {
  async recordHelperLocation(
    helperId: string,
    payload: THelperLocationPing,
  ): Promise<void> {
    try {
      const now = Date.now();
      const meta = {
        helperId,
        latitude: payload.latitude,
        longitude: payload.longitude,
        heading: payload.heading ?? 0,
        speed: payload.speed ?? 0,
        jobId: payload.jobId || "",
        updatedAt: now,
      };

      if (redisClient.isAvailable()) {
        const client = redisClient.client;
        await Promise.all([
          // Store in Geospatial index
          client.geoAdd(GEO_KEY, {
            longitude: payload.longitude,
            latitude: payload.latitude,
            member: helperId,
          }),
          // Store latest metadata with auto-expiring TTL
          client.setEx(
            `${META_KEY_PREFIX}${helperId}`,
            TTL_SECONDS,
            JSON.stringify(meta),
          ),
        ]);
      }

      const io = getSocketServer();
      if (io && payload.jobId) {
        // Broadcast location update to anyone watching this specific job
        io.to(getTrackingRoom(payload.jobId)).emit("tracking:location_update", {
          ...meta,
        });
      }
    } catch (error) {
      logger.error("Error recording helper location ping:", error);
    }
  },

  async getHelperLatestLocation(
    helperId: string,
  ): Promise<TLiveHelperData | null> {
    try {
      if (!redisClient.isAvailable()) return null;
      const client = redisClient.client;
      const raw = await client.get(`${META_KEY_PREFIX}${helperId}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      logger.error(`Error getting helper location for ${helperId}:`, error);
      return null;
    }
  },

  async getAllLiveHelpers(): Promise<TLiveHelperData[]> {
    try {
      if (!redisClient.isAvailable()) {
        return [];
      }

      const client = redisClient.client;
      const keys: string[] = [];
      for await (const batch of client.scanIterator({
        MATCH: `${META_KEY_PREFIX}*`,
        COUNT: 100,
      })) {
        if (Array.isArray(batch)) {
          keys.push(...batch);
        } else {
          keys.push(batch as unknown as string);
        }
      }
      if (!keys.length) return [];

      const values = await client.mGet(keys);
      const results: TLiveHelperData[] = [];

      for (const val of values) {
        if (val) {
          try {
            results.push(JSON.parse(val));
          } catch (_) {}
        }
      }

      return results;
    } catch (error) {
      logger.error("Error fetching live helpers:", error);
      return [];
    } finally {
      // Fire-and-forget stale member cleanup in the background
      SocketTrackingService.cleanupStaleHelpers().catch(() => {});
    }
  },

  async cleanupStaleHelpers(): Promise<number> {
    try {
      if (!redisClient.isAvailable()) return 0;
      const client = redisClient.client;
      const members = await client.zRange(GEO_KEY, 0, -1);
      if (!members || members.length === 0) return 0;

      const pipeline = client.multi();
      for (const m of members) {
        pipeline.exists(`${META_KEY_PREFIX}${m}`);
      }
      const results = await pipeline.exec();

      const toRemove: string[] = [];
      members.forEach((m, idx) => {
        if (!results || Number(results[idx]) === 0) {
          toRemove.push(m);
        }
      });

      if (toRemove.length > 0) {
        await client.zRem(GEO_KEY, toRemove);
        logger.info(`Cleaned up ${toRemove.length} expired helpers from ${GEO_KEY}`);
      }
      return toRemove.length;
    } catch (error) {
      logger.error("Error cleaning up stale helpers:", error);
      return 0;
    }
  },

  async removeHelper(helperId: string): Promise<void> {
    try {
      if (redisClient.isAvailable()) {
        const client = redisClient.client;
        await Promise.all([
          client.zRem(GEO_KEY, helperId),
          client.del(`${META_KEY_PREFIX}${helperId}`),
        ]);
      }
    } catch (error) {
      logger.error("Error removing helper from active tracking:", error);
    }
  },
};
