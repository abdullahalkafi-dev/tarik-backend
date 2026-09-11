import { Router } from "express";
import auth from "@middlewares/auth";
import { NotificationController } from "./notification.controller";

const router = Router();

/**
 * @route   GET /api/v1/notifications
 * @desc    Paginated in-app notification history for current user
 * @access  Private
 */
router.get("/", auth(), NotificationController.listNotifications);

/**
 * @route   GET /api/v1/notifications/unread-count
 * @desc    Unread badge count
 * @access  Private
 */
router.get("/unread-count", auth(), NotificationController.unreadCount);

/**
 * @route   PATCH /api/v1/notifications/read-all
 * @desc    Mark all notifications read
 * @access  Private
 */
router.patch("/read-all", auth(), NotificationController.markAllRead);

/**
 * @route   PATCH /api/v1/notifications/:id/read
 * @desc    Mark one notification read
 * @access  Private
 */
router.patch("/:id/read", auth(), NotificationController.markRead);

export const NotificationRoutes = router;
