import { Auth } from "module/auth/auth.model";
import { UserRepository } from "module/user/user.repository";
import { sendFCMMulticast } from "./firebase";
import { logger } from "logger/logger";
import { NotificationRepository } from "module/notification/notification.repository";
import { NotificationAudience } from "module/notification/notification.interface";
import { SettingsService } from "module/settings/settings.service";

export type AdminAlertSetting = "newUserRegistrations" | "successfulPayments" | "customerServiceTickets";

/**
 * Fire-and-forget alert to the admin team: one in-app notification per admin
 * (dashboard bell) plus a push to every device of the admins who are logged
 * into the mobile app.
 *
 * `permission` limits the alert to staff who actually handle that area
 * (Super Admins and holders of "*" always get it).
 */
export const notifyAdmins = async (
  title: string,
  body: string,
  data?: Record<string, string>,
  permission?: string,
  /** The Settings → Notifications switch that controls this kind of alert. */
  settingKey?: AdminAlertSetting,
): Promise<void> => {
  try {
    if (settingKey) {
      const settings: any = await SettingsService.getSettings();
      if (settings?.notifications?.[settingKey] === false) return;
    }

    const adminAuths = await Auth.find({
      $or: [{ role: { $in: ["admin", "superAdmin", "staff"] } }, { isSuperAdmin: true }],
      isDeleted: { $ne: true },
      isBlacklisted: { $ne: true },
      status: { $ne: "suspended" },
    } as any)
      .select("_id role isSuperAdmin permissions")
      .lean();

    const eligible = adminAuths.filter((a: any) => {
      if (!permission) return true;
      if (a.isSuperAdmin) return true;
      const perms: string[] = a.permissions || [];
      return perms.includes("*") || perms.includes(permission);
    });

    if (!eligible.length) {
      logger.warn("[FCM] notifyAdmins — no eligible admin accounts", { permission });
      return;
    }

    const admins = await UserRepository.findMany(
      {
        auth: { $in: eligible.map((a: any) => a._id) },
        isBlocked: { $ne: true },
        isDeleted: { $ne: true },
      } as any,
      { limit: 50 },
    );

    for (const adminUser of admins) {
      NotificationRepository.create({
        user: (adminUser as any)._id,
        audience: NotificationAudience.ADMIN,
        title,
        body,
        data: data || {},
      }).catch(() => undefined);
    }

    const tokens = Array.from(
      new Set(admins.flatMap((u: any) => UserRepository.tokensOf(u))),
    );
    if (!tokens.length) return;

    const { invalidTokens } = await sendFCMMulticast(tokens, title, body, data);
    for (const dead of invalidTokens) {
      await UserRepository.clearDeviceTokenByValue(dead);
    }
  } catch (err) {
    logger.warn("[FCM] notifyAdmins error", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
};
