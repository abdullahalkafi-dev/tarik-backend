import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { Secret } from "jsonwebtoken";
import config from "../config";
import AppError from "../errors/AppError";
import { verifyJwtToken } from "jwt";
import { UserRepository } from "module/user/user.repository";

const STAFF_ROLES = ["admin", "staff", "superAdmin"];

/**
 * Authenticates the bearer token and loads the account.
 *
 * The role, super-admin flag and permissions are ALWAYS read from the
 * database, never from the token, so demoting a staff member, approving or
 * revoking a helper, suspending or banning an account takes effect on the very
 * next request. A token is also rejected once its `tv` (token version) is older
 * than the account's, which is how password changes and bans end old sessions.
 */
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
      // Password-reset tokens are signed with the same secret: never accept them as sessions.
      if (decoded.type || !decoded.userId) {
        throw new AppError(StatusCodes.UNAUTHORIZED, "You are not authorized");
      }

      const user = await UserRepository.findById(decoded.userId, { populate: "auth" });
      const authDoc = (user?.auth as any) || null;

      if (
        !user ||
        !authDoc ||
        user.isDeleted ||
        user.isBlocked ||
        authDoc.isBlacklisted ||
        authDoc.isDeleted ||
        authDoc.status === "suspended"
      ) {
        throw new AppError(
          StatusCodes.UNAUTHORIZED,
          "Account suspended or blacklisted. You are not authorized.",
        );
      }

      if ((decoded.tv ?? 0) !== (authDoc.tokenVersion ?? 0)) {
        throw new AppError(
          StatusCodes.UNAUTHORIZED,
          "Your session has ended. Please log in again.",
          { code: "SESSION_REVOKED" },
        );
      }

      const isSuperAdmin = Boolean(authDoc.isSuperAdmin);
      const effectiveRole = isSuperAdmin ? "superAdmin" : authDoc.role || "user";
      const isStaff = STAFF_ROLES.includes(effectiveRole);

      (user as any).role = effectiveRole;
      (user as any).isSuperAdmin = isSuperAdmin;
      // Only staff accounts carry permissions; everyone else has none (fail closed).
      (user as any).permissions = isSuperAdmin ? ["*"] : isStaff ? authDoc.permissions || [] : [];
      (user as any).sessionId = decoded.sid ? String(decoded.sid) : undefined;
      req.user = user;

      // A staff member who still has the temporary password may only change it
      // (or read their own profile / sign out) until they have chosen their own.
      if (isStaff && !isSuperAdmin && authDoc.mustChangePassword) {
        const path = (req.originalUrl || "").split("?")[0];
        const allowed = ["/auth/change-password", "/auth/logout", "/admin/me"].some((p) => path.endsWith(p));
        if (!allowed) {
          throw new AppError(
            StatusCodes.FORBIDDEN,
            "Please choose a new password before using the console",
            { code: "PASSWORD_CHANGE_REQUIRED" },
          );
        }
      }

      if (roles.length && !roles.includes(effectiveRole)) {
        throw new AppError(StatusCodes.FORBIDDEN, "You don't have permission to access this API");
      }

      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Checks that the authenticated staff member holds at least one of the given
 * permissions. Super Admins and holders of the "*" wildcard always pass.
 * Must be placed after `auth(...)`.
 */
export const requirePermission =
  (...permissions: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user as any;
    if (user?.isSuperAdmin) return next();
    const held: string[] = user?.permissions || [];
    if (held.includes("*") || permissions.some((p) => held.includes(p))) {
      return next();
    }
    return next(
      new AppError(
        StatusCodes.FORBIDDEN,
        "You don't have permission for this action",
        { code: "MISSING_PERMISSION", params: { permission: permissions.join(" | ") } },
      ),
    );
  };

/**
 * Like `requirePermission`, but only applies to staff accounts. Endpoints that
 * are shared between customers (cancel my own job) and the admin console use
 * this: a customer passes through, a staff member must hold the permission.
 */
export const requireStaffPermission =
  (...permissions: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const role = (req.user as any)?.role;
    if (!STAFF_ROLES.includes(role)) return next();
    return requirePermission(...permissions)(req, res, next);
  };

export default auth;
