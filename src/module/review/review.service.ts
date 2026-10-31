import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { ReviewRepository } from "./review.repository";
import { Review } from "./review.model";
import { JobRepository } from "module/job/job.repository";
import { UserRepository } from "module/user/user.repository";
import { SettingsService } from "module/settings/settings.service";
import { resolveUrl } from "util/minio";
import { notifyUserT } from "util/notifyUser";
import { notifyAdmins } from "util/notifyAdmins";

const EDIT_WINDOW_HOURS = 24;
const MAX_REVIEWS_PER_PAIR_PER_30_DAYS = 3;

type TCreateReviewPayload = {
  jobId?: string;
  job?: string;
  // Accepted for older apps but IGNORED: the person being reviewed is always the other party of the job.
  revieweeId?: string;
  reviewee?: string;
  rating: number;
  comment?: string;
};

const idOf = (v: any): string => String(v?._id ?? v ?? "");

/** "Ahmed Benali" → "Ahmed B." — a public review does not show full names. */
const shortName = (name?: string) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

const recalcRating = async (userId: string) => {
  const { avgRating, reviewCount } = await ReviewRepository.calculateAverageRating(userId);
  await UserRepository.updateById(userId, { rating: avgRating, reviewCount });
};

const createReview = async (reviewerId: string, payload: TCreateReviewPayload) => {
  const jobId = String(payload.jobId || payload.job || "");
  const rating = Number(payload.rating);
  const comment = payload.comment?.trim();

  // A low rating needs a reason (it hurts a person's livelihood).
  if (rating <= 2 && (!comment || comment.length < 5)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Please explain a low rating in a few words", {
      code: "COMMENT_REQUIRED",
    });
  }

  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  if (job.status !== "completed") {
    throw new AppError(StatusCodes.BAD_REQUEST, "Reviews can only be submitted for completed jobs");
  }

  // Ensure reviewer was part of this job
  const isOwner = idOf(job.postedBy) === String(reviewerId);
  const isAssigned = idOf(job.assignedTo) === String(reviewerId);

  if (!isOwner && !isAssigned) {
    throw new AppError(StatusCodes.FORBIDDEN, "You were not part of this job");
  }

  // The reviewee is derived here, never taken from the request.
  const targetRevieweeId = isOwner ? idOf(job.assignedTo) : idOf(job.postedBy);
  if (!targetRevieweeId || targetRevieweeId === String(reviewerId)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Reviewee could not be identified");
  }

  // Jobs far below the minimum amount (fake 1-MAD jobs) do not generate ratings.
  const settings = await SettingsService.getSettings();
  const minAmount = Number(settings?.minimumServiceAmount) || 0;
  if (minAmount > 0 && (job.budget || 0) < minAmount) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This job is below the minimum amount and cannot be rated", {
      code: "JOB_TOO_SMALL",
    });
  }

  // Check for duplicate review
  const existingReview = await ReviewRepository.findByJobAndReviewer(jobId, reviewerId);
  if (existingReview) {
    throw new AppError(StatusCodes.CONFLICT, "You have already submitted a review for this booking");
  }

  // The same two accounts cannot pump each other's rating.
  const recentPair = await Review.countDocuments({
    reviewer: reviewerId,
    reviewee: targetRevieweeId,
    createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) },
  } as any);
  if (recentPair >= MAX_REVIEWS_PER_PAIR_PER_30_DAYS) {
    throw new AppError(StatusCodes.TOO_MANY_REQUESTS, "You have already rated this person several times recently", {
      code: "REVIEW_PAIR_LIMIT",
    });
  }

  const review = await ReviewRepository.create({
    job: jobId as any,
    reviewer: reviewerId as any,
    reviewee: targetRevieweeId as any,
    rating,
    comment,
  });

  await recalcRating(targetRevieweeId);

  notifyUserT(
    targetRevieweeId,
    "review.new",
    { rating },
    { type: "review_received", jobId: String(job._id), rating: String(rating) },
  ).catch(() => undefined);

  return review;
};

/** Public list: first name + initial, no job titles. */
const getUserReviews = async (userId: string, page = 1, limit = 20) => {
  const rows: any[] = await ReviewRepository.findByUser(userId, page, Math.min(limit, 50));
  return rows.map((r) => ({
    _id: r._id,
    rating: r.rating,
    comment: r.comment,
    reply: r.reply?.text ? { text: r.reply.text, at: r.reply.at } : undefined,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
    reviewer: r.reviewer
      ? { _id: r.reviewer._id, name: shortName(r.reviewer.name), avatar: resolveUrl(r.reviewer.avatar) }
      : null,
  }));
};

/** The author may correct their review within a day. */
const editReview = async (reviewerId: string, reviewId: string, patch: { rating?: number; comment?: string }) => {
  const review = await ReviewRepository.findById(reviewId);
  if (!review) throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
  if (idOf(review.reviewer) !== String(reviewerId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "You can only edit your own review");
  }
  if (Date.now() - new Date(review.createdAt).getTime() > EDIT_WINDOW_HOURS * 3_600_000) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Reviews can only be edited within 24 hours", {
      code: "EDIT_WINDOW_PASSED",
    });
  }
  const rating = patch.rating ?? review.rating;
  const comment = patch.comment !== undefined ? patch.comment.trim() : review.comment;
  if (rating <= 2 && (!comment || comment.length < 5)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Please explain a low rating in a few words", {
      code: "COMMENT_REQUIRED",
    });
  }
  review.rating = rating;
  review.comment = comment;
  review.editedAt = new Date();
  await review.save();
  await recalcRating(idOf(review.reviewee));
  return review;
};

/** The reviewed person answers publicly, once. */
const replyToReview = async (userId: string, reviewId: string, text: string) => {
  const review = await ReviewRepository.findById(reviewId);
  if (!review) throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
  if (idOf(review.reviewee) !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only the reviewed person can reply");
  }
  if (review.reply?.text) {
    throw new AppError(StatusCodes.CONFLICT, "You already replied to this review", { code: "ALREADY_REPLIED" });
  }
  review.reply = { text: text.trim(), at: new Date() };
  await review.save();
  return review;
};

/** Flag an unfair / abusive review for moderation. */
const reportReview = async (userId: string, reviewId: string, reason: string) => {
  const review = await ReviewRepository.findById(reviewId);
  if (!review) throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
  if (idOf(review.reviewee) !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only the reviewed person can report a review");
  }
  review.reportedAt = new Date();
  review.reportedBy = userId as any;
  review.reportReason = reason.trim();
  await review.save();
  notifyAdmins("Review reported", `A review was reported: ${reason.slice(0, 80)}`, {
    type: "review_reported",
    reviewId,
  }, "reviews.manage").catch(() => undefined);
  return { reported: true };
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getAllReviews = async (query: {
  page?: number;
  limit?: number;
  rating?: number;
  jobId?: string;
  revieweeId?: string;
  reviewerId?: string;
  search?: string;
  reported?: boolean;
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
  if (query.reported) {
    filter.reportedAt = { $exists: true };
  }
  if (query.search) {
    filter.comment = { $regex: escapeRegex(query.search), $options: "i" };
  }

  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const [docs, total] = await ReviewRepository.findAll(filter, page, limit);
  return { docs, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/** Moderator keeps the review: the report is closed and the review stops being flagged. */
const dismissReport = async (reviewId: string) => {
  const review = await ReviewRepository.findById(reviewId);
  if (!review) throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
  review.set("reportedAt", undefined);
  review.set("reportedBy", undefined);
  review.set("reportReason", undefined);
  await review.save();
  return { message: "Report dismissed" };
};

const deleteReview = async (reviewId: string) => {
  const review = await ReviewRepository.findById(reviewId);
  if (!review) {
    throw new AppError(StatusCodes.NOT_FOUND, "Review not found");
  }
  const revieweeId = idOf(review.reviewee);
  await ReviewRepository.deleteById(reviewId);
  await recalcRating(revieweeId);

  return { message: "Review deleted and rating updated successfully" };
};

export const ReviewService = {
  createReview,
  getUserReviews,
  editReview,
  replyToReview,
  reportReview,
  getAllReviews,
  deleteReview,
  dismissReport,
};
