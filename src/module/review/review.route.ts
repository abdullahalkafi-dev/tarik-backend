import { Router } from "express";
import auth, { requirePermission } from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { createContentLimiter } from "@middlewares/security";
import { ReviewController } from "./review.controller";
import { ReviewDto } from "./review.dto";

const router = Router();

/**
 * @route   POST /api/v1/reviews
 * @desc    Submit a review for a completed job (the reviewee is always the other party)
 * @access  Private
 */
router.post(
  "/",
  auth(),
  createContentLimiter,
  validateRequest(ReviewDto.createReview),
  ReviewController.createReview,
);

/**
 * @route   GET /api/v1/reviews/user/:userId
 * @desc    Get reviews for a user/helper (first name + initial only)
 * @access  Public
 */
router.get("/user/:userId", ReviewController.getUserReviews);

/**
 * @route   GET /api/v1/reviews
 * @desc    List all reviews with filtering (Admin)
 * @access  Private (staff, reviews.manage)
 */
router.get(
  "/",
  auth("superAdmin", "admin", "staff"),
  requirePermission("reviews.manage"),
  validateRequest(ReviewDto.listQuery),
  ReviewController.getAllReviews,
);

/**
 * @route   PATCH /api/v1/reviews/:id
 * @desc    Author edits their review within 24 h
 * @access  Private
 */
router.patch("/:id", auth(), validateRequest(ReviewDto.editReview), ReviewController.editReview);

/**
 * @route   POST /api/v1/reviews/:id/reply
 * @desc    The reviewed person answers publicly (once)
 * @access  Private
 */
router.post("/:id/reply", auth(), validateRequest(ReviewDto.reply), ReviewController.replyToReview);

/**
 * @route   POST /api/v1/reviews/:id/report
 * @desc    The reviewed person reports an unfair review to moderation
 * @access  Private
 */
router.post("/:id/report", auth(), validateRequest(ReviewDto.report), ReviewController.reportReview);

/**
 * @route   POST /api/v1/reviews/:id/dismiss-report
 * @desc    Keep a reported review and close the report (Admin)
 * @access  Private (staff, reviews.manage)
 */
router.post(
  "/:id/dismiss-report",
  auth("superAdmin", "admin", "staff"),
  requirePermission("reviews.manage"),
  ReviewController.dismissReport,
);

/**
 * @route   DELETE /api/v1/reviews/:id
 * @desc    Delete a review for moderation (Admin)
 * @access  Private (staff, reviews.manage)
 */
router.delete(
  "/:id",
  auth("superAdmin", "admin", "staff"),
  requirePermission("reviews.manage"),
  ReviewController.deleteReview,
);

export const ReviewRoutes = router;
