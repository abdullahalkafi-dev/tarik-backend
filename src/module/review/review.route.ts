import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { ReviewController } from "./review.controller";
import { ReviewDto } from "./review.dto";

const router = Router();

/**
 * @route   POST /api/v1/reviews
 * @desc    Submit a review for a completed job
 * @access  Private
 */
router.post(
  "/",
  auth(),
  validateRequest(ReviewDto.createReview),
  ReviewController.createReview
);

/**
 * @route   GET /api/v1/reviews/user/:userId
 * @desc    Get reviews for a user/helper
 * @access  Public
 */
router.get("/user/:userId", ReviewController.getUserReviews);

/**
 * @route   GET /api/v1/reviews
 * @desc    List all reviews with filtering (Admin)
 * @access  Private (superAdmin, admin, staff)
 */
router.get("/", auth("superAdmin", "admin", "staff"), ReviewController.getAllReviews);

/**
 * @route   DELETE /api/v1/reviews/:id
 * @desc    Delete a review for moderation (Admin)
 * @access  Private (superAdmin, admin)
 */
router.delete("/:id", auth("superAdmin", "admin", "staff"), ReviewController.deleteReview);

export const ReviewRoutes = router;
