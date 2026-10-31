import { ExtendedError } from "socket.io/dist/namespace";
import { Socket } from "socket.io";
import { Secret } from "jsonwebtoken";
import config from "config";
import { verifyJwtToken } from "jwt";
import { UserRepository } from "module/user/user.repository";

/**
 * The token is accepted from the handshake `auth` payload or the Authorization
 * header only. A `?token=` query string is NOT accepted: URLs end up in proxy
 * and access logs.
 */
const extractToken = (socket: Socket): string | null => {
  const authToken = socket.handshake.auth?.token;
  const authorizationHeader = socket.handshake.headers.authorization;

  const rawToken =
    typeof authToken === "string"
      ? authToken
      : typeof authorizationHeader === "string"
        ? authorizationHeader
        : null;

  if (!rawToken) return null;
  return rawToken.startsWith("Bearer ") ? rawToken.slice(7) : rawToken;
};

export const socketAuthMiddleware = async (
  socket: Socket,
  next: (err?: ExtendedError) => void,
) => {
  try {
    const token = extractToken(socket);
    if (!token) return next(new Error("Unauthorized"));

    const decoded = verifyJwtToken(token, config.jwt.jwt_secret as Secret);
    if (decoded.type || !decoded.userId) return next(new Error("Unauthorized"));

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
      return next(new Error("Unauthorized: Account suspended or blacklisted"));
    }

    if ((decoded.tv ?? 0) !== (authDoc.tokenVersion ?? 0)) {
      return next(new Error("Unauthorized: session ended"));
    }

    socket.data.userId = String(user._id);
    socket.data.authId = String(authDoc._id);
    socket.data.isSuperAdmin = Boolean(authDoc.isSuperAdmin);
    // Role comes from the database (same rule as the HTTP middleware).
    socket.data.role = authDoc.isSuperAdmin ? "superAdmin" : authDoc.role || "user";
    socket.data.approvedHelper = user.helperApplicationStatus === "approved";

    next();
  } catch {
    next(new Error("Unauthorized"));
  }
};
