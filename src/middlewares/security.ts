import helmet from "helmet";
import rateLimit, {
  ClientRateLimitInfo,
  ipKeyGenerator,
  MemoryStore,
  Options,
  Store,
} from "express-rate-limit";
import compression from "compression";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../logger/logger";
import redisClient from "../redis/redisClient";

export const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  // Allow dashboard (other origin/port) to embed /upload/files/* images & video
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

/**
 * Rate-limit counters shared through Redis (so they survive restarts and work
 * with several API instances). If Redis is down it transparently falls back to
 * a per-process in-memory counter instead of switching the limit off.
 */
class HybridRateLimitStore implements Store {
  private windowMs = 60_000;
  private readonly memory = new MemoryStore();
  private readonly keyPrefix: string;

  constructor(name: string) {
    this.keyPrefix = `rl:${name}:`;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    if (redisClient.isAvailable()) {
      try {
        const redisKey = this.keyPrefix + key;
        const totalHits = await redisClient.incrWithWindow(redisKey, Math.ceil(this.windowMs / 1000));
        const ttl = await redisClient.client.pTTL(redisKey);
        return { totalHits, resetTime: new Date(Date.now() + (ttl > 0 ? ttl : this.windowMs)) };
      } catch {
        // fall through to memory
      }
    }
    return this.memory.increment(key);
  }

  async decrement(key: string): Promise<void> {
    if (redisClient.isAvailable()) {
      try {
        await redisClient.client.decr(this.keyPrefix + key);
        return;
      } catch {
        // fall through to memory
      }
    }
    await this.memory.decrement(key);
  }

  async resetKey(key: string): Promise<void> {
    if (redisClient.isAvailable()) {
      try {
        await redisClient.client.del(this.keyPrefix + key);
      } catch {
        // ignore
      }
    }
    await this.memory.resetKey(key);
  }
}

/** Key = logged-in user when known, otherwise the caller's IP. */
const userOrIpKey = (req: Request): string => {
  const userId = (req as any).user?._id;
  return userId ? `u:${String(userId)}` : `ip:${ipKeyGenerator(req.ip || "unknown")}`;
};

type LimiterOptions = {
  name: string;
  windowMs: number;
  max: number;
  message: string;
  perUser?: boolean;
  skipSuccessfulRequests?: boolean;
};

export const createLimiter = (opts: LimiterOptions) =>
  rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    message: { success: false, message: opts.message },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: opts.skipSuccessfulRequests,
    store: new HybridRateLimitStore(opts.name),
    ...(opts.perUser ? { keyGenerator: userOrIpKey } : {}),
  });

export const generalLimiter = createLimiter({
  name: "general",
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many requests, please try again later.",
});

export const authLimiter = createLimiter({
  name: "auth",
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many authentication attempts, please try again later.",
  skipSuccessfulRequests: true,
});

export const strictLimiter = createLimiter({
  name: "strict",
  windowMs: 60 * 1000,
  max: 50,
  message: "Too many requests for this operation.",
});

/** Address search / reverse geocoding: per logged-in user, generous enough for typing. */
export const geocodingLimiter = createLimiter({
  name: "geocoding",
  windowMs: 60 * 1000,
  max: 90,
  message: "Too many location requests, please try again in a moment.",
  perUser: true,
});

/** Chat messages: protects conversations from spam and floods. */
export const messageLimiter = createLimiter({
  name: "message",
  windowMs: 60 * 1000,
  max: 30,
  message: "You are sending messages too fast. Please slow down.",
  perUser: true,
});

/** Creating jobs / offers / tickets (things that notify other people). */
export const createContentLimiter = createLimiter({
  name: "create-content",
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: "Too many requests. Please try again later.",
  perUser: true,
});

export const supportTicketLimiter = createLimiter({
  name: "support-ticket",
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  message: "You have reached the daily limit of support tickets.",
  perUser: true,
});

export const uploadLimiter = createLimiter({
  name: "upload",
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many uploads. Please wait a moment.",
  perUser: true,
});

export const compressionConfig: RequestHandler = compression({
  filter: (_req: Request, res: Response) => {
    if (_req.headers["x-no-compression"]) return false;
    return compression.filter(_req, res);
  },
  threshold: 1024,
  level: 1,
}) as RequestHandler;

/**
 * Request hardening: drops MongoDB operator keys ("$where", "$ne"…) from the
 * body. Text content is NOT rewritten here — rewriting user text corrupts
 * legitimate messages and passwords ("Monday=2pm"), and every UI must escape
 * output anyway. Input shape is enforced by the Zod DTOs.
 */
export const additionalSanitization = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const MAX_DEPTH = 12;

  const strip = (obj: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) return obj;
    if (Array.isArray(obj)) return obj.map((v) => strip(v, depth + 1));
    if (obj && typeof obj === "object") {
      const clean: Record<string, unknown> = {};
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (key.startsWith("$") || key === "__proto__" || key === "constructor" || key === "prototype") {
          logger.warn(`Suspicious key "${key}" in request body from ${req.ip}`);
          continue;
        }
        clean[key] = strip((obj as Record<string, unknown>)[key], depth + 1);
      }
      return clean;
    }
    return obj;
  };

  if (req.body && typeof req.body === "object") {
    try {
      req.body = strip(req.body, 0);
    } catch {
      logger.warn("Error sanitizing request body");
    }
  }

  next();
};
