import { UserRepository } from "module/user/user.repository";
import { sendFCMNotification } from "./firebase";
import { logger } from "logger/logger";
import { NotificationRepository } from "module/notification/notification.repository";
import { NotificationAudience } from "module/notification/notification.interface";

/**
 * Fire-and-forget push to a user's registered FCM device token.
 * Also persists an in-app notification row (best-effort).
 * Clears dead tokens from Mongo when Firebase says they are invalid.
 */
export const notifyUser = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> => {
  try {
    logger.info("[FCM] notifyUser start", {
      userId,
      title,
      data: data || {},
    });

    // History first — works even when the user has no FCM token yet.
    NotificationRepository.create({
      user: userId,
      audience: NotificationAudience.USER,
      title,
      body,
      data: data || {},
    }).catch(() => {});

    const user = await UserRepository.findById(userId, { select: "deviceToken" });
    if (!user?.deviceToken) {
      logger.warn("[FCM] notifyUser skipped — no deviceToken on user", {
        userId,
        hasUserDoc: Boolean(user),
      });
      return;
    }

    logger.info("[FCM] notifyUser sending", {
      userId,
      tokenPreview: String(user.deviceToken).slice(0, 16) + "...",
      title,
    });

    const result = await sendFCMNotification(user.deviceToken, title, body, data);

    if (result.success) {
      logger.info("[FCM] notifyUser OK", { userId, title });
    } else if (result.invalidToken) {
      await UserRepository.clearDeviceTokenByValue(user.deviceToken);
      logger.warn("[FCM] notifyUser invalid token cleared", { userId });
    } else {
      logger.warn("[FCM] notifyUser FAILED", { userId, title });
    }
  } catch (err) {
    logger.warn("[FCM] notifyUser error", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
};
