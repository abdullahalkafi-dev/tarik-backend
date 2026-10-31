import { Types } from "mongoose";
import { AppNotification } from "./notification.model";
import { NotificationAudience, TAppNotification } from "./notification.interface";

const create = async (payload: {
  user?: string | Types.ObjectId;
  audience?: NotificationAudience;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<TAppNotification | null> => {
  try {
    return await AppNotification.create({
      user: payload.user ? new Types.ObjectId(String(payload.user)) : undefined,
      audience: payload.audience || NotificationAudience.USER,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      read: false,
    });
  } catch {
    // Never break the caller (FCM path) because of a history write
    return null;
  }
};

const listForUser = async (
  userId: string,
  options: { page?: number; limit?: number; audience?: NotificationAudience } = {},
) => {
  const page = options.page || 1;
  const limit = Math.min(options.limit || 20, 50);
  const filter: Record<string, unknown> = {
    user: new Types.ObjectId(userId),
  };
  if (options.audience) {
    filter.audience = options.audience;
  }

  const [docs, total, unread] = await Promise.all([
    AppNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec(),
    AppNotification.countDocuments(filter).exec(),
    AppNotification.countDocuments({ ...filter, read: false }).exec(),
  ]);

  return {
    docs: docs.map((d) => ({
      ...d,
      _id: String(d._id),
      user: d.user != null ? String(d.user) : undefined,
    })),
    total,
    unread,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

const unreadCount = async (userId: string, audience?: NotificationAudience) => {
  const filter: Record<string, unknown> = {
    user: new Types.ObjectId(userId),
    read: false,
  };
  if (audience) filter.audience = audience;
  return AppNotification.countDocuments(filter).exec();
};

const markRead = async (userId: string, notificationId: string) => {
  if (!Types.ObjectId.isValid(notificationId)) return null;
  // Idempotent: still return the row if it was already read
  return AppNotification.findOneAndUpdate(
    {
      _id: new Types.ObjectId(notificationId),
      user: new Types.ObjectId(userId),
    },
    { $set: { read: true, readAt: new Date() } },
    { returnDocument: "after" },
  ).lean();
};

const markAllRead = async (userId: string, audience?: NotificationAudience) => {
  const filter: Record<string, unknown> = {
    user: new Types.ObjectId(userId),
    read: false,
  };
  if (audience) filter.audience = audience;
  const res = await AppNotification.updateMany(filter, {
    $set: { read: true, readAt: new Date() },
  });
  return res.modifiedCount || 0;
};

/**
 * Chat: keep ONE unread row per conversation (the latest message) instead of a
 * new row for every message — the previous unread one is dropped before the new
 * row is written, so the list stays short and correctly ordered.
 */
const dropUnreadChat = async (userId: string, conversationId: string): Promise<void> => {
  try {
    await AppNotification.deleteMany({
      user: new Types.ObjectId(userId),
      read: false,
      "data.type": "chat_message",
      "data.conversationId": conversationId,
    });
  } catch {
    // best effort
  }
};

const removeOne = async (userId: string, notificationId: string) => {
  if (!Types.ObjectId.isValid(notificationId)) return 0;
  const res = await AppNotification.deleteOne({
    _id: new Types.ObjectId(notificationId),
    user: new Types.ObjectId(userId),
  });
  return res.deletedCount || 0;
};

const removeAll = async (userId: string, audience?: NotificationAudience) => {
  const filter: Record<string, unknown> = { user: new Types.ObjectId(userId) };
  if (audience) filter.audience = audience;
  const res = await AppNotification.deleteMany(filter);
  return res.deletedCount || 0;
};

export const NotificationRepository = {
  create,
  dropUnreadChat,
  removeOne,
  removeAll,
  listForUser,
  unreadCount,
  markRead,
  markAllRead,
};
