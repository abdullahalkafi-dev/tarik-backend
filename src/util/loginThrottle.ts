import { StatusCodes } from "http-status-codes";
import AppError from "../errors/AppError";
import redisClient from "../redis/redisClient";

const MAX_FAILURES = 5;
const WINDOW_SECONDS = 15 * 60;

const keyFor = (kind: string, id: string) => `login_fail:${kind}:${id.toLowerCase()}`;

/**
 * Password brute-force protection per account identifier (phone / e-mail).
 * After 5 wrong passwords the identifier is locked for the rest of the
 * 15-minute window. If Redis is down the check is skipped (fail-open) so a
 * cache outage can never lock everybody out.
 */
export const LoginThrottle = {
  async assertNotLocked(kind: string, id: string): Promise<void> {
    if (!redisClient.isAvailable()) return;
    try {
      const raw = await redisClient.get(keyFor(kind, id));
      if (raw && Number(raw) >= MAX_FAILURES) {
        throw new AppError(
          StatusCodes.TOO_MANY_REQUESTS,
          "Too many failed attempts. Please try again in 15 minutes.",
          { code: "LOGIN_LOCKED" },
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
    }
  },

  async registerFailure(kind: string, id: string): Promise<void> {
    if (!redisClient.isAvailable()) return;
    try {
      await redisClient.incrWithWindow(keyFor(kind, id), WINDOW_SECONDS);
    } catch {
      // ignore
    }
  },

  async clear(kind: string, id: string): Promise<void> {
    if (!redisClient.isAvailable()) return;
    try {
      await redisClient.delete(keyFor(kind, id));
    } catch {
      // ignore
    }
  },
};
