import redisClient from "../redis/redisClient";
import { buildCacheKey } from "../redis/cache.utils";

class SocketPresenceManager {
  private readonly userSockets = new Map<string, Set<string>>();
  private readonly socketUsers = new Map<string, string>();

  private getPresenceKey(userId: string) {
    return buildCacheKey("socket", "presence", userId);
  }

  private getLocalConnectionCount(userId: string) {
    return this.userSockets.get(userId)?.size || 0;
  }

  private async getGlobalConnectionCount(userId: string) {
    if (!redisClient.isAvailable()) {
      return this.getLocalConnectionCount(userId);
    }
    const key = this.getPresenceKey(userId);
    return redisClient.client.sCard(key);
  }

  async addConnection(userId: string, socketId: string) {
    const previousCount = await this.getGlobalConnectionCount(userId);

    const socketSet = this.userSockets.get(userId) || new Set<string>();
    socketSet.add(socketId);
    this.userSockets.set(userId, socketSet);
    this.socketUsers.set(socketId, userId);

    if (redisClient.isAvailable()) {
      const key = this.getPresenceKey(userId);
      await redisClient.client.sAdd(key, socketId);
      await redisClient.client.expire(key, 60 * 60 * 24);
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
      const key = this.getPresenceKey(userId);
      await redisClient.client.sRem(key, socketId);
      connectionCount = await redisClient.client.sCard(key);

      if (connectionCount === 0) {
        await redisClient.client.del(key);
      }
    }

    return {
      userId,
      becameOffline: connectionCount === 0,
      connectionCount,
    };
  }

  async isUserOnline(userId: string) {
    return (await this.getGlobalConnectionCount(userId)) > 0;
  }
}

export const SocketPresenceService = new SocketPresenceManager();
