import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Secret } from "jsonwebtoken";
import config from "../config";
import AppError from "../errors/AppError";
import { verifyJwtToken } from "jwt";
import { UserRepository } from "module/user/user.repository";

const auth =
  (...roles: string[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const tokenWithBearer = req.headers.authorization;

      if (!tokenWithBearer?.startsWith("Bearer ")) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "You are not authorized");
      }

      const token = tokenWithBearer.split(" ")[1];
      if (!token) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "You are not authorized");
      }

      const decoded = verifyJwtToken(token, config.jwt.jwt_secret as Secret);
      const user = await UserRepository.findById(decoded.userId, { populate: "auth" });

      if (!user || user.isDeleted || user.isBlocked || (user.auth as any)?.isBlacklisted || (user.auth as any)?.isDeleted) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "Account suspended or blacklisted. You are not authorized.");
      }

      const effectiveRole = decoded.isSuperAdmin ? "superAdmin" : (decoded.role || "user");
      (user as any).role = effectiveRole;
      (user as any).isSuperAdmin = decoded.isSuperAdmin || false;
      (user as any).permissions = decoded.permissions || ["*"];
      req.user = user;

      if (roles.length && !roles.includes(effectiveRole)) {
        throw new AppError(StatusCodes.FORBIDDEN, "You don't have permission to access this API");
      }

      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Middleware that checks whether the authenticated user has a specific permission.
 * Super Admins bypass all permission checks automatically.
 * Staff with permissions: ["*"] also pass all checks.
 */
export const requirePermission =
  (permission: string) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user as any;
    if (user?.isSuperAdmin) return next();
    const permissions: string[] = user?.permissions || [];
    if (permissions.includes("*") || permissions.includes(permission)) {
      return next();
    }
    return next(new AppError(StatusCodes.FORBIDDEN, `Missing required permission: ${permission}`));
  };

export default auth;

