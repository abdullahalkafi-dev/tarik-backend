import redisClient from "../redis/redisClient";
import { buildCacheKey } from "../redis/cache.utils";
import { logger } from "../logger/logger";

/**
 * Who is online.
 *
 * Every connected socket is a member of a sorted set `presence:<userId>` scored
 * by its last heartbeat. A socket whose node crashed stops heartbeating, so it
 * silently drops out of "online" after STALE_MS instead of keeping the user
 * online forever (the previous Set-with-24h-expiry behaviour).
 */
const STALE_MS = 90_000;
const HEARTBEAT_MS = 30_000;

class SocketPresenceManager {
  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketUsers = new Map<string, string>();
  private heartbeat: NodeJS.Timeout | null = null;

  private key(userId: string) {
    return buildCacheKey("socket", "presence", userId);
  }

  private getLocalConnectionCount(userId: string) {
    return this.userSockets.get(userId)?.size || 0;
  }

  /** Fresh (heartbeating) sockets of this user across all server nodes. */
  private async freshCount(userId: string): Promise<number> {
    if (!redisClient.isAvailable()) return this.getLocalConnectionCount(userId);
    const key = this.key(userId);
    const cutoff = Date.now() - STALE_MS;
    await redisClient.client.zRemRangeByScore(key, 0, cutoff);
    return redisClient.client.zCard(key);
  }

  async addConnection(userId: string, socketId: string) {
    let previousCount = this.getLocalConnectionCount(userId);
    try {
      previousCount = await this.freshCount(userId);
    } catch (err) {
      logger.warn(`[PRESENCE] count failed: ${err instanceof Error ? err.message : err}`);
    }

    const socketSet = this.userSockets.get(userId) || new Set<string>();
    socketSet.add(socketId);
    this.userSockets.set(userId, socketSet);
    this.socketUsers.set(socketId, userId);

    if (redisClient.isAvailable()) {
      try {
        const key = this.key(userId);
        await redisClient.client.zAdd(key, { score: Date.now(), value: socketId });
        await redisClient.client.expire(key, 60 * 60);
      } catch (err) {
        logger.warn(`[PRESENCE] add failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    return {
      userId,
      becameOnline: previousCount === 0,
      connectionCount: previousCount + 1,
    };
  }

  async removeConnection(socketId: string) {
    const userId = this.socketUsers.get(socketId);

    if (!userId) {
      return { userId: null, becameOffline: false, connectionCount: 0 };
    }

    const socketSet = this.userSockets.get(userId);
    socketSet?.delete(socketId);
    if (!socketSet || socketSet.size === 0) {
      this.userSockets.delete(userId);
    }
    this.socketUsers.delete(socketId);

    let connectionCount = this.getLocalConnectionCount(userId);
    if (redisClient.isAvailable()) {
      try {
        const key = this.key(userId);
        await redisClient.client.zRem(key, socketId);
        connectionCount = await this.freshCount(userId);
        if (connectionCount === 0) await redisClient.client.del(key);
      } catch (err) {
        logger.warn(`[PRESENCE] remove failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    return { userId, becameOffline: connectionCount === 0, connectionCount };
  }

  async isUserOnline(userId: string) {
    try {
      return (await this.freshCount(userId)) > 0;
    } catch {
      return this.getLocalConnectionCount(userId) > 0;
    }
  }

  /** Online flags for a list of users in one go. */
  async onlineMap(userIds: string[]): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    await Promise.all(
      userIds.map(async (id) => {
        out[id] = await this.isUserOnline(id);
      }),
    );
    return out;
  }

  /** Refresh the heartbeat of every socket connected to THIS node. */
  private async beat() {
    if (!redisClient.isAvailable()) return;
    const now = Date.now();
    try {
      const multi = redisClient.client.multi();
      for (const [userId, sockets] of this.userSockets) {
        const key = this.key(userId);
        for (const socketId of sockets) multi.zAdd(key, { score: now, value: socketId });
        multi.expire(key, 60 * 60);
      }
      await multi.exec();
    } catch (err) {
      logger.warn(`[PRESENCE] heartbeat failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  startHeartbeat() {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => void this.beat(), HEARTBEAT_MS);
    this.heartbeat.unref?.();
  }

  stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

export const SocketPresenceService = new SocketPresenceManager();
