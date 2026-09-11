import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { ReviewRepository } from "./review.repository";
import { JobRepository } from "module/job/job.repository";
import { UserRepository } from "module/user/user.repository";
import { notifyUser } from "util/notifyUser";

type TCreateReviewPayload = {
  jobId?: string;
  job?: string;
  revieweeId?: string;
  reviewee?: string;
  rating: number;
  comment?: string;
};

const createReview = async (reviewerId: string, payload: TCreateReviewPayload) => {
  const jobId = String(payload.jobId || payload.job || "");
  const rating = Number(payload.rating);
  const comment = payload.comment;

  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  if (job.status !== "completed") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Reviews can only be submitted for completed jobs"
    );
  }

  // Ensure reviewer was part of this job
  const isOwner = String(job.postedBy?._id || job.postedBy) === String(reviewerId);
  const isAssigned = String(job.assignedTo?._id || job.assignedTo) === String(reviewerId);

  if (!isOwner && !isAssigned) {
    throw new AppError(StatusCodes.FORBIDDEN, "You were not part of this job");
  }

  let targetRevieweeId = String(payload.revieweeId || payload.reviewee || "");
  if (!targetRevieweeId) {
    targetRevieweeId = isOwner
      ? String(job.assignedTo?._id || job.assignedTo)
      : String(job.postedBy?._id || job.postedBy);
  }

  if (!targetRevieweeId) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Reviewee could not be identified");
  }

  // Check for duplicate review
  const existingReview = await ReviewRepository.findByJobAndReviewer(jobId, reviewerId);
  if (existingReview) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "You have already submitted a review for this booking"
    );
  }

  const review = await ReviewRepository.create({
    job: jobId as any,
    reviewer: reviewerId as any,
    reviewee: targetRevieweeId as any,
    rating,
    comment,
  });

  // Automatically recalculate and update reviewee average rating
  const { avgRating, reviewCount } = await ReviewRepository.calculateAverageRating(targetRevieweeId);
  await UserRepository.updateById(targetRevieweeId, {
    rating: avgRating,
    reviewCount,
  });

  notifyUser(
    targetRevieweeId,
    "New review",
    `You received a ${rating}-star review for "${job.title}".`,
    { type: "review_received", jobId: String(job._id), rating: String(rating) },
  ).catch(() => {});

  return review;
};

const getUserReviews = async (userId: string, page = 1, limit = 20) => {
  return ReviewRepository.findByUser(userId, page, limit);
};

const getAllReviews = async (query: {
  page?: number;
  limit?: number;
  rating?: number;
  jobId?: string;
  revieweeId?: string;
  reviewerId?: string;
  search?: string;
} = {}) => {
  const filter: any = {};
  if (query.rating) {
    filter.rating = Number(query.rating);
  }
  if (query.jobId) {
    filter.job = query.jobId;
  }
  if (query.revieweeId) {
    filter.reviewee = query.revieweeId;
  }
  if (query.reviewerId) {
    filter.reviewer = query.reviewerId;
  }
  if (query.search) {
    filter.comment = { $regex: query.search, $options: "i" };
  }

  const page = query.page || 1;
  const limit = query.limit || 20;
  const [docs, total] = await ReviewRepository.findAll(filter, page, limit);
  return { docs, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const deleteReview = async (reviewId: string) => {
  const review = await ReviewRepository.findById(reviewId);
  if (!review) {
    throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
  }
  const revieweeId = String(review.reviewee);
  await ReviewRepository.deleteById(reviewId);

  // Recalculate average rating
  const { avgRating, reviewCount } = await ReviewRepository.calculateAverageRating(revieweeId);
  await UserRepository.updateById(revieweeId, {
    rating: avgRating,
    reviewCount,
  });

  return { message: "Review deleted and rating updated successfully" };
};

export const ReviewService = {
  createReview,
  getUserReviews,
  getAllReviews,
  deleteReview,
};
