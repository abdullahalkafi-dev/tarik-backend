import { Request, Response, NextFunction } from "express";
import morgan, { StreamOptions } from "morgan";
import config from "../config";
import { errorLogger, logger } from "./logger";

const SENSITIVE_KEYS = /pass(word)?|otp|token|secret|authorization|cookie|code|pin|cvv|card|iban/i;

/** Deep copy of a payload with every sensitive value replaced by "***". */
export const maskSensitive = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => maskSensitive(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "***" : maskSensitive(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
};

const isDevelopment = config.node_env === "development";

morgan.token("message", (_req: Request, res: Response) => res?.locals?.errorMessage || "");

// Request bodies are only ever logged in development, and always masked.
morgan.token("body", (req: Request) => {
  if (!isDevelopment) return "";
  if (req.body && Object.keys(req.body).length > 0) {
    try {
      return ` | Body: ${JSON.stringify(maskSensitive(req.body))}`;
    } catch {
      return ` | Body: [Complex/Unserializable]`;
    }
  }
  return "";
});

const getIpFormat = (): string => (isDevelopment ? ":remote-addr - " : "");

// Query strings are logged without the query part: they can carry tokens.
const successFormat = `${getIpFormat()}:method :url :status - :response-time ms:body`;
const errorFormat = `${getIpFormat()}:method :url :status - :response-time ms - :message:body`;

morgan.token("url", (req: Request) => {
  const url = req.originalUrl || req.url || "";
  const q = url.indexOf("?");
  return q === -1 ? url : `${url.slice(0, q)}?…`;
});

const successStream: StreamOptions = {
  write: (message: string) => logger.info(`\x1b[92m${message.trim()}\x1b[0m`),
};

const errorStream: StreamOptions = {
  write: (message: string) => errorLogger.error(`\x1b[91m${message.trim()}\x1b[0m`),
};

const successHandler = morgan(successFormat, {
  skip: (_req: Request, res: Response) => res.statusCode >= 400,
  stream: successStream,
});

const errorHandler = morgan(errorFormat, {
  skip: (_req: Request, res: Response) => res.statusCode < 400,
  stream: errorStream,
});

/**
 * Development-only diagnostics: method, URL and masked body of every request.
 * In every other environment this is a no-op.
 */
export const incomingRequestLogger = (req: Request, _res: Response, next: NextFunction) => {
  if (!isDevelopment) return next();
  if (req.originalUrl === "/health" || req.originalUrl === "/") {
    return next();
  }
  const hasBody = req.body && Object.keys(req.body).length > 0;
  const bodyStr = hasBody ? ` | Body: ${JSON.stringify(maskSensitive(req.body))}` : "";

  logger.info(`📥 [REQ] ${req.method} ${(req.originalUrl || "").split("?")[0]}${bodyStr}`);
  next();
};

export const Morgan = { errorHandler, successHandler, incomingRequestLogger };
