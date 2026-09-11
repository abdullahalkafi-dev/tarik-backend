const redisModuleName = "redis";
const redisPackage = require(redisModuleName) as {
  createClient: typeof import("redis").createClient;
};

export const createClient = redisPackage.createClient;
export type RedisClientType = import("redis").RedisClientType;
