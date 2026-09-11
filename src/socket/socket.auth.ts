import { ExtendedError } from "socket.io/dist/namespace";
import { Socket } from "socket.io";
import { Secret } from "jsonwebtoken";
import config from "config";
import { verifyJwtToken } from "jwt";
import { UserRepository } from "module/user/user.repository";

const extractToken = (socket: Socket): string | null => {
  const authToken = socket.handshake.auth.token;
  const authorizationHeader = socket.handshake.headers.authorization;
  const queryToken = socket.handshake.query.token;

  const rawToken =
    typeof authToken === "string"
      ? authToken
      : typeof authorizationHeader === "string"
        ? authorizationHeader
        : typeof queryToken === "string"
          ? queryToken
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
    const user = await UserRepository.findById(decoded.userId, { populate: "auth" });

    if (!user || user.isDeleted || user.isBlocked || (user.auth as any)?.isBlacklisted || (user.auth as any)?.isDeleted) {
      return next(new Error("Unauthorized: Account suspended or blacklisted"));
    }

    socket.data.userId = String(user._id);
    socket.data.user = user;
    // Mirror HTTP auth: role lives on Auth JWT, not the User document.
    socket.data.isSuperAdmin = Boolean(decoded.isSuperAdmin);
    socket.data.role = decoded.isSuperAdmin
      ? "superAdmin"
      : decoded.role || "user";

    next();
  } catch {
    next(new Error("Unauthorized"));
  }
};
