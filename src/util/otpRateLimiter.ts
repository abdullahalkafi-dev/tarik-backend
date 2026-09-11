import { StatusCodes } from "http-status-codes";
import AppError from "../errors/AppError";
import redisClient from "../redis/redisClient";

const OTP_RATE_LIMIT_PREFIX = "otp_rate_limit";
const MAX_OTP_PER_WINDOW = 3;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

export const checkAndIncrementOtpRateLimit = async (phone: string): Promise<void> => {
  const key = `${OTP_RATE_LIMIT_PREFIX}:${phone}`;

  try {
    const current = await redisClient.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= MAX_OTP_PER_WINDOW) {
      throw new AppError(
        StatusCodes.TOO_MANY_REQUESTS,
        "Too many OTP requests. Please wait 15 minutes before requesting another code.",
      );
    }

    if (count === 0) {
      await redisClient.set(key, "1", WINDOW_SECONDS);
    } else {
      await redisClient.set(key, String(count + 1), WINDOW_SECONDS);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    // If redis is unavailable, do not block the user
  }
};
