import { Types } from "mongoose";
import { TReview } from "./review.interface";
import { Review } from "./review.model";

export const ReviewRepository = {
  create(payload: Partial<TReview>) {
    return Review.create(payload);
  },

  findByUser(revieweeId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const revieweeOid = Types.ObjectId.isValid(revieweeId)
      ? new Types.ObjectId(revieweeId)
      : revieweeId;
    return Review.find({ reviewee: revieweeOid })
      .populate("reviewer", "name avatar")
      .populate("job", "title")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  },

  findAll(filter = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return Promise.all([
      Review.find(filter)
        .populate("reviewer", "name email phone avatar")
        .populate("reviewee", "name email phone avatar")
        .populate("job", "title budget status paymentMethod")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Review.countDocuments(filter).exec(),
    ]);
  },

  findById(id: string) {
    return Review.findById(id);
  },

  deleteById(id: string) {
    return Review.findByIdAndDelete(id);
  },

  findByJobAndReviewer(jobId: string, reviewerId: string) {
    return Review.findOne({ job: jobId, reviewer: reviewerId });
  },

  /** Reviews this user wrote for a set of jobs (for My Bookings / My Job). */
  findByReviewerAndJobs(reviewerId: string, jobIds: string[]) {
    if (!jobIds.length) return Promise.resolve([]);
    return Review.find({
      reviewer: reviewerId,
      job: { $in: jobIds },
    }).lean();
  },

  /** All reviews on jobs where user is reviewer or reviewee. */
  findByJobsForUser(userId: string, jobIds: string[]) {
    if (!jobIds.length) return Promise.resolve([]);
    return Review.find({
      job: { $in: jobIds },
      $or: [{ reviewer: userId }, { reviewee: userId }],
    }).lean();
  },

  async calculateAverageRating(revieweeId: string) {
    // Aggregate matches ObjectId only — string IDs never match stored docs
    const revieweeOid = Types.ObjectId.isValid(revieweeId)
      ? new Types.ObjectId(revieweeId)
      : revieweeId;
    const stats = await Review.aggregate([
      { $match: { reviewee: revieweeOid } },
      {
        $group: {
          _id: "$reviewee",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    if (stats.length > 0) {
      return {
        avgRating: Math.round(stats[0].avgRating * 10) / 10,
        reviewCount: stats[0].count,
      };
    }
    return { avgRating: 0, reviewCount: 0 };
  },
};
