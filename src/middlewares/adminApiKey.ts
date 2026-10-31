import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import config from "../config";

const extractApiKey = (req: Request): string => {
  // Header only: a key in the URL ends up in access logs, proxies and history.
  // The Authorization header is reserved for user JWTs.
  const directKey = req.header("x-admin-key") || req.header("x-api-key");
  return directKey ? directKey.trim() : "";
};

const secureEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export const requireAdminApiKey = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const expectedApiKey = config.admin_secret_key;
  if (!expectedApiKey) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Server misconfiguration: ADMIN_SECRET_KEY is missing",
    });
    return;
  }

  const receivedKey = extractApiKey(req);
  if (!receivedKey || !secureEquals(receivedKey, expectedApiKey)) {
    res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      message: "Unauthorized: invalid admin API key",
    });
    return;
  }

  next();
};
