import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../logger/logger";

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

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: "Too many authentication attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  message: { success: false, message: "Too many requests for this operation." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const geocodingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many location requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "development",
});

export const compressionConfig: RequestHandler = compression({
  filter: (_req: Request, res: Response) => {
    if (_req.headers["x-no-compression"]) return false;
    return compression.filter(_req, res);
  },
  threshold: 1024,
  level: 1,
}) as RequestHandler;

export const additionalSanitization = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const sanitizeString = (str: string): string =>
    str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/on\w+\s*=/gi, "");

  const sanitizeObject = (obj: unknown): unknown => {
    if (typeof obj === "string") return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (obj && typeof obj === "object") {
      const sanitized: Record<string, unknown> = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (key.startsWith("$")) {
            logger.warn(`Suspicious key "${key}" in request body from ${req.ip}`);
            continue;
          }
          sanitized[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    try {
      req.body = sanitizeObject(req.body);
    } catch {
      logger.warn("Error sanitizing request body");
    }
  }

  next();
};
