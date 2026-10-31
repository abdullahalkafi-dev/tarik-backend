import { Schema, model } from "mongoose";
import { TReview } from "./review.interface";

const reviewSchema = new Schema<TReview>(
  {
    job: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    reviewer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
    editedAt: { type: Date },
    reply: {
      text: { type: String, trim: true, maxlength: 500 },
      at: { type: Date },
    },
    reportedAt: { type: Date },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reportReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

reviewSchema.index({ job: 1, reviewer: 1 }, { unique: true });
reviewSchema.index({ reviewee: 1 });
reviewSchema.index({ reviewer: 1, reviewee: 1, createdAt: -1 });
reviewSchema.index({ reportedAt: 1 }, { sparse: true });

export const Review = model<TReview>("Review", reviewSchema);
