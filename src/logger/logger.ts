import path from "path";
import DailyRotateFile from "winston-daily-rotate-file";
import { createLogger, format, transports } from "winston";
import config from "../config";

const { combine, timestamp, label, printf, errors, colorize } = format;

const LOG_DIR = path.join(process.cwd(), "logs");
const APP_NAME = config.app_name || "3awniNet";

const customFormat = printf((info) => {
  const { level, message, label, timestamp, stack } = info;
  const date = new Date(timestamp as string);
  const dateStr = date.toLocaleDateString("en-US", {
    timeZone: "Africa/Casablanca",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    timeZone: "Africa/Casablanca",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${dateStr} ${timeStr} [${label}] ${level}: ${stack || message}`;
});

const logFormat = combine(
  label({ label: APP_NAME }),
  timestamp(),
  errors({ stack: true }),
  customFormat,
);

const logger = createLogger({
  level: "info",
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "success", "%DATE%-success.log"),
      datePattern: "DD-MM-YYYY",
      maxSize: "20m",
      maxFiles: "7d",
      zippedArchive: true,
      level: "info",
    }),
    new transports.Console({ format: combine(colorize(), logFormat) }),
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "exceptions", "%DATE%-exceptions.log"),
      datePattern: "DD-MM-YYYY",
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
    }),
  ],
  // Unhandled promise rejections are logged (not fatal) by server.ts; winston's
  // own rejection handler would exit the process, so it is intentionally absent.
});

const errorLogger = createLogger({
  level: "error",
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(LOG_DIR, "error", "%DATE%-error.log"),
      datePattern: "DD-MM-YYYY",
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
    }),
    new transports.Console({ format: combine(colorize(), logFormat) }),
  ],
});

export { errorLogger, logger };
