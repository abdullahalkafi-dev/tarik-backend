import { UserRepository } from "module/user/user.repository";
import { sendFCMNotification, sendFCMMulticast, ttlForType } from "./firebase";
import { logger } from "logger/logger";
import { NotificationRepository } from "module/notification/notification.repository";
import { NotificationAudience } from "module/notification/notification.interface";
import redisClient from "../redis/redisClient";
import { renderTemplate, normalizeLocale } from "./notificationTemplates";
import { isUserInConversationRoom } from "../socket/socket.gateway";

export type NotifyOptions = {
  /** Don't push when the recipient is looking at this very conversation. */
  skipPushIfInConversation?: string;
  ttlSeconds?: number;
};

type TData = Record<string, string>;

const USER_FIELDS = "deviceToken deviceTokens notificationPrefs locale isBlocked isDeleted";

/** Which per-user switch controls a given push (the master `push` switch always applies). */
const prefKeyFor = (data?: TData): "payments" | "newService" | "appUpdates" | null => {
  const type = String(data?.type || "");
  if (type === "new_job") return "newService";
  if (type.startsWith("payment") || data?.orderType) return "payments";
  if (type === "app_update") return "appUpdates";
  return null;
};

const pushAllowed = (user: any, data?: TData): boolean => {
  const prefs = user?.notificationPrefs || {};
  if (prefs.push === false) return false;
  const key = prefKeyFor(data);
  if (key && prefs[key] === false) return false;
  return true;
};

/** Short, entity-based key so two different messages are never treated as duplicates. */
const entityKey = (data?: TData): string =>
  String(
    data?.messageId ||
      data?.conversationId ||
      data?.jobId ||
      data?.offerMessageId ||
      data?.orderId ||
      data?.ticketId ||
      "",
  );

const saveInApp = async (userId: string, title: string, body: string, data: TData) => {
  // One live row per conversation instead of one per message.
  if (data.type === "chat_message" && data.conversationId) {
    await NotificationRepository.dropUnreadChat(userId, data.conversationId);
  }
  await NotificationRepository.create({
    user: userId,
    audience: NotificationAudience.USER,
    title,
    body,
    data,
  });
};

const deliver = async (
  user: any,
  userId: string,
  title: string,
  body: string,
  data: TData,
  options: NotifyOptions,
): Promise<void> => {
  // History is ALWAYS written (it is the user's inbox); only the push is conditional.
  await saveInApp(userId, title, body, data).catch(() => undefined);

  if (!user || user.isBlocked || user.isDeleted) return;
  if (!pushAllowed(user, data)) return;

  if (
    options.skipPushIfInConversation &&
    (await isUserInConversationRoom(userId, options.skipPushIfInConversation).catch(() => false))
  ) {
    return;
  }

  const tokens = UserRepository.tokensOf(user);
  if (!tokens.length) {
    logger.warn("[FCM] push skipped — no device token", { userId });
    return;
  }

  // Throttle only the PUSH (3 s) for the same user + type + entity: protects against
  // double-fires without hiding the second, third… message of a conversation.
  const dedupKey = `notify:push:${userId}:${data.type || "x"}:${entityKey(data)}:${title}`;
  const isNew = await redisClient.setNX(dedupKey, "1", 3).catch(() => true);
  if (!isNew) return;

  const ttlSeconds = options.ttlSeconds ?? ttlForType(data.type);

  if (tokens.length === 1) {
    const result = await sendFCMNotification(tokens[0], title, body, data, { ttlSeconds });
    if (result.invalidToken) {
      await UserRepository.clearDeviceTokenByValue(tokens[0]);
    } else if (!result.success) {
      logger.warn("[FCM] notifyUser FAILED", { userId, title });
    }
  } else {
    const { invalidTokens } = await sendFCMMulticast(tokens, title, body, data, { ttlSeconds });
    for (const dead of invalidTokens) await UserRepository.clearDeviceTokenByValue(dead);
  }
};

/**
 * Fire-and-forget notification with literal text: in-app history row + push to
 * every device of the user. Prefer `notifyUserT` so the text follows the user's language.
 */
export const notifyUser = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  options: NotifyOptions = {},
): Promise<void> => {
  try {
    const user = await UserRepository.findById(userId, { select: USER_FIELDS });
    await deliver(user, userId, title, body, data || {}, options);
  } catch (err) {
    logger.warn("[FCM] notifyUser error", {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
};

/** Same as `notifyUser`, but the text comes from a template in the user's language. */
export const notifyUserT = async (
  userId: string,
  templateKey: string,
  params: Record<string, unknown> = {},
  data?: Record<string, string>,
  options: NotifyOptions = {},
): Promise<void> => {
  try {
    const user = await UserRepository.findById(userId, { select: USER_FIELDS });
    const { title, body } = renderTemplate(templateKey, user?.locale, params);
    await deliver(user, userId, title, body, data || {}, options);
  } catch (err) {
    logger.warn("[FCM] notifyUserT error", {
      userId,
      templateKey,
      err: err instanceof Error ? err.message : String(err),
    });
  }
};

/** Localized template text for a given locale (helper for places that build their own payloads). */
export const textFor = (
  templateKey: string,
  locale: string | null | undefined,
  params: Record<string, unknown> = {},
) => renderTemplate(templateKey, normalizeLocale(locale), params);

/**
 * Notify many users with the same template, each in their own language.
 * Used for "new job nearby" fan-out; pushes are sent in multicast batches.
 */
export const notifyManyT = async (
  userIds: string[],
  templateKey: string,
  params: Record<string, unknown>,
  data: TData,
): Promise<void> => {
  try {
    if (!userIds.length) return;
    const users = await UserRepository.findMany({ _id: { $in: userIds } }, { select: USER_FIELDS });

    const byLocale = new Map<string, { tokens: string[]; text: { title: string; body: string } }>();

    await Promise.all(
      users.map(async (u: any) => {
        const locale = normalizeLocale(u.locale);
        const text = renderTemplate(templateKey, locale, params);
        await saveInApp(String(u._id), text.title, text.body, data).catch(() => undefined);

        if (u.isBlocked || u.isDeleted || !pushAllowed(u, data)) return;
        const tokens = UserRepository.tokensOf(u);
        if (!tokens.length) return;
        const group = byLocale.get(locale) || { tokens: [], text };
        group.tokens.push(...tokens);
        byLocale.set(locale, group);
      }),
    );

    for (const { tokens, text } of byLocale.values()) {
      const { invalidTokens } = await sendFCMMulticast(tokens, text.title, text.body, data, {
        ttlSeconds: ttlForType(data.type),
      });
      for (const dead of invalidTokens) await UserRepository.clearDeviceTokenByValue(dead);
    }
  } catch (err) {
    logger.warn("[FCM] notifyManyT error", {
      templateKey,
      err: err instanceof Error ? err.message : String(err),
    });
  }
};
