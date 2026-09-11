import { Request, Response, NextFunction } from "express";
import morgan, { StreamOptions } from "morgan";
import config from "../config";
import { errorLogger, logger } from "./logger";

morgan.token("message", (_req: Request, res: Response) => res?.locals?.errorMessage || "");

morgan.token("body", (req: Request) => {
  if (req.body && Object.keys(req.body).length > 0) {
    try {
      return ` | Body: ${JSON.stringify(req.body)}`;
    } catch {
      return ` | Body: [Complex/Unserializable]`;
    }
  }
  return "";
});

const getIpFormat = (): string =>
  config.node_env === "development" ? ":remote-addr - " : "";

const successFormat = `${getIpFormat()}:method :url :status - :response-time ms:body`;
const errorFormat = `${getIpFormat()}:method :url :status - :response-time ms - :message:body`;

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
 * Global incoming request logger middleware for development diagnostics.
 * Logs method, URL, query parameters, and raw request body upon receipt.
 */
export const incomingRequestLogger = (req: Request, _res: Response, next: NextFunction) => {
  if (req.originalUrl === "/health" || req.originalUrl === "/") {
    return next();
  }
  const hasQuery = req.query && Object.keys(req.query).length > 0;
  const hasBody = req.body && Object.keys(req.body).length > 0;
  const queryStr = hasQuery ? ` | Query: ${JSON.stringify(req.query)}` : "";
  const bodyStr = hasBody ? ` | Body: ${JSON.stringify(req.body)}` : "";

  logger.info(`📥 [REQ] ${req.method} ${req.originalUrl}${queryStr}${bodyStr}`);
  next();
};

export const Morgan = { errorHandler, successHandler, incomingRequestLogger };


