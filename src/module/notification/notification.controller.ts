import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { NotificationService } from "./notification.service";

const listNotifications = catchAsync(async (req, res) => {
  const result = await NotificationService.listMyNotifications(
    req.user?._id as string,
    {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      audience: req.query.audience as string | undefined,
    },
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Notifications fetched successfully",
    data: result,
  });
});

const unreadCount = catchAsync(async (req, res) => {
  const result = await NotificationService.getUnreadCount(
    req.user?._id as string,
    req.query.audience as string | undefined,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Unread count fetched successfully",
    data: result,
  });
});

const markRead = catchAsync(async (req, res) => {
  const result = await NotificationService.markOneRead(
    req.user?._id as string,
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Notification marked as read",
    data: result,
  });
});

const markAllRead = catchAsync(async (req, res) => {
  const result = await NotificationService.markAllRead(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "All notifications marked as read",
    data: result,
  });
});

export const NotificationController = {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
};
