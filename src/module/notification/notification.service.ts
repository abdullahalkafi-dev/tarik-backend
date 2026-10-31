import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { NotificationRepository } from "./notification.repository";
import { NotificationAudience } from "./notification.interface";

const listMyNotifications = async (
  userId: string,
  query: { page?: number; limit?: number; audience?: string },
) => {
  const audience =
    query.audience === "admin" ? NotificationAudience.ADMIN : NotificationAudience.USER;
  return NotificationRepository.listForUser(userId, {
    page: query.page,
    limit: query.limit,
    audience,
  });
};

const getUnreadCount = async (userId: string, audience?: string) => {
  const aud =
    audience === "admin" ? NotificationAudience.ADMIN : NotificationAudience.USER;
  return { unread: await NotificationRepository.unreadCount(userId, aud) };
};

const markOneRead = async (userId: string, id: string) => {
  const updated = await NotificationRepository.markRead(userId, id);
  if (!updated) {
    throw new AppError(StatusCodes.NOT_FOUND, "Notification not found");
  }
  return updated;
};

const markAllRead = async (userId: string, audience?: string) => {
  const aud = audience === "admin" ? NotificationAudience.ADMIN : NotificationAudience.USER;
  const count = await NotificationRepository.markAllRead(userId, aud);
  return { marked: count };
};

const removeOne = async (userId: string, id: string) => {
  const deleted = await NotificationRepository.removeOne(userId, id);
  if (!deleted) throw new AppError(StatusCodes.NOT_FOUND, "Notification not found");
  return { deleted };
};

const removeAll = async (userId: string, audience?: string) => {
  const aud = audience === "admin" ? NotificationAudience.ADMIN : NotificationAudience.USER;
  return { deleted: await NotificationRepository.removeAll(userId, aud) };
};

export const NotificationService = {
  listMyNotifications,
  getUnreadCount,
  markOneRead,
  markAllRead,
  removeOne,
  removeAll,
};
