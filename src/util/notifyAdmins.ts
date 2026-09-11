import { Auth } from "module/auth/auth.model";
import { UserRepository } from "module/user/user.repository";
import { sendFCMMulticast } from "./firebase";
import { logger } from "logger/logger";
import { NotificationRepository } from "module/notification/notification.repository";
import { NotificationAudience } from "module/notification/notification.interface";

/**
 * Fire-and-forget push to all admin / superAdmin / staff device tokens.
 * Persists one in-app notification per admin user (dashboard bell).
 * Note: FCM only reaches admins who logged into the **mobile app** (have deviceToken).
 */
export const notifyAdmins = async (
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> => {
  try {
    // $ne: true matches false OR missing (legacy docs without the field).
    // Also match isSuperAdmin in case role string drifted.
    const adminAuths = await Auth.find({
      $or: [
        { role: { $in: ["admin", "superAdmin", "staff"] } },
        { isSuperAdmin: true },
      ],
      isDeleted: { $ne: true },
      isBlacklisted: { $ne: true },
    } as any)
      .select("_id role isSuperAdmin")
      .lean();

    logger.info("[FCM] notifyAdmins start", {
      title,
      adminAuthCount: adminAuths.length,
    });

    if (!adminAuths.length) {
      try {
        const total = await Auth.countDocuments({});
        const sample = await Auth.find({})
          .select("role isSuperAdmin isDeleted isBlacklisted")
          .limit(10)
          .lean();
        logger.warn("[FCM] notifyAdmins — no admin/staff auth docs", {
          totalAuthDocs: total,
          sample,
        });
      } catch (dbgErr) {
        logger.warn("[FCM] notifyAdmins — no admin/staff auth docs");
      }
      return;
    }

    const authIds = adminAuths.map((a: any) => a._id);
    // All admin/staff user docs (for in-app history), not only those with FCM tokens
    const allAdminUsers = await UserRepository.findMany(
      {
        auth: { $in: authIds },
        isBlocked: { $ne: true },
        isDeleted: { $ne: true },
      } as any,
      { limit: 50 },
    );

    if (!allAdminUsers.length) {
      logger.warn(
        "[FCM] notifyAdmins — admin auths found but no linked User docs",
        { authIds: authIds.map(String) },
      );
      return;
    }

    for (const adminUser of allAdminUsers) {
      NotificationRepository.create({
        user: (adminUser as any)._id,
        audience: NotificationAudience.ADMIN,
        title,
        body,
        data: data || {},
      }).catch(() => {});
    }

    const users = allAdminUsers.filter((u: any) => u.deviceToken);
    const tokens = users
      .map((u: any) => u.deviceToken)
      .filter(Boolean) as string[];

    logger.info("[FCM] notifyAdmins tokens", {
      adminUsersFound: allAdminUsers.length,
      tokenCount: tokens.length,
    });

    if (!tokens.length) {
      logger.warn(
        "[FCM] notifyAdmins skipped push — no admin deviceToken (in-app history still saved)",
      );
      return;
    }

    const { invalidTokens } = await sendFCMMulticast(tokens, title, body, data);
    logger.info("[FCM] notifyAdmins sent", {
      sent: tokens.length,
      invalid: invalidTokens.length,
      title,
    });
    for (const dead of invalidTokens) {
      await UserRepository.clearDeviceTokenByValue(dead);
    }
  } catch (err) {
    logger.warn("[FCM] notifyAdmins error", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
};
