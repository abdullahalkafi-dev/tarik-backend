import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import AppError from "../errors/AppError";
import handleCastError from "../errors/handleCastError";
import handleDuplicateError from "../errors/handleDuplicateError";
import handleValidationError from "../errors/handleValidationError";
import handleZodError from "../errors/handleZodError";
import config from "../config";
import { errorLogger } from "../logger/logger";
import { TErrorSources } from "../types/error";

const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next): void => {
  let statusCode = 500;
  let message = "Something went wrong!";
  let errorSources: TErrorSources = [{ path: "", message: "Something went wrong" }];

  if (err instanceof ZodError) {
    const result = handleZodError(err);
    statusCode = result.statusCode;
    message = result.message;
    errorSources = result.errorSources;
  } else if (err?.name === "ValidationError") {
    const result = handleValidationError(err);
    statusCode = result.statusCode;
    message = result.message;
    errorSources = result.errorSources;
  } else if (err?.name === "CastError") {
    const result = handleCastError(err);
    statusCode = result.statusCode;
    message = result.message;
    errorSources = result.errorSources;
  } else if (err?.code === 11000) {
    const result = handleDuplicateError(err);
    statusCode = result.statusCode;
    message = result.message;
    errorSources = result.errorSources;
  } else if (err?.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Your session has expired. Please login again.";
    errorSources = [{ path: "", message: "JWT token has expired" }];
  } else if (err?.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Please login again.";
    errorSources = [{ path: "", message: "Invalid JWT token" }];
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errorSources = err.errorSources || [{ path: "", message: err.message }];
  } else if (err?.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Invalid JSON in request body";
    errorSources = [{ path: "", message }];
  } else if (err?.type === "entity.too.large" || err?.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    message = "The request or file is too large";
    errorSources = [{ path: "", message }];
  } else if (err?.name === "MulterError") {
    statusCode = 400;
    message = err.message || "Invalid upload";
    errorSources = [{ path: err.field || "", message }];
  } else if (err instanceof Error) {
    // Honour 4xx statuses set by libraries (body-parser, etc.); anything else
    // is an unexpected server error and its text is never sent to the client.
    const libStatus = Number((err as any).status || (err as any).statusCode);
    if (libStatus >= 400 && libStatus < 500) {
      statusCode = libStatus;
      message = err.message;
      errorSources = [{ path: "", message: err.message }];
    } else if (config.node_env === "development") {
      message = err.message;
      errorSources = [{ path: "", message: err.message }];
    }
  }

  res.locals.errorMessage = err.message;

  errorLogger.error(`${req.method} ${req.originalUrl} → ${message}`, {
    errorSources,
    stack: err?.stack,
    ...(config.node_env === "development" && {
      body: req.body,
      params: req.params,
      query: req.query,
    }),
  });

  res.status(statusCode).json({
    success: false,
    message,
    errorSources,
    ...(err instanceof AppError && err.code ? { code: err.code } : {}),
    ...(err instanceof AppError && err.params ? { params: err.params } : {}),
    ...(err instanceof AppError && err.details ? { details: err.details } : {}),
    stack: config.node_env === "development" ? err?.stack : null,
  });
};

export default globalErrorHandler;
