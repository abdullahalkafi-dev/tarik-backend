import { Schema, model } from "mongoose";
import {
  TJob,
  JobStatus,
  BudgetType,
  PaymentMethod,
} from "./job.interface";

const jobSchema = new Schema<TJob>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    date: { type: Date },
    startTime: { type: String, trim: true },
    endTime: { type: String, trim: true },
    budget: { type: Number, required: true, min: 0 },
    budgetType: {
      type: String,
      enum: Object.values(BudgetType),
      default: BudgetType.FIXED,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.CASH,
    },
    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.OPEN,
    },
    address: { type: String, trim: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    images: [{ type: String }],
    postedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    commissionDeducted: { type: Number, default: 0 },
    cancellationReason: { type: String, trim: true },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    cancelledAt: { type: Date },
    completedAt: { type: Date },
    escrowCredited: { type: Boolean, default: false },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "none"],
      default: "none",
    },
    isCustomOffer: { type: Boolean, default: false },
    refundStatus: {
      type: String,
      enum: ["none", "pending", "refunded", "failed", "wallet_only"],
      default: "none",
    },
    refundReference: { type: String },
    history: [
      {
        action: {
          type: String,
          enum: ["created", "accepted", "completed", "cancelled", "payment_open", "refunded"],
          required: true,
        },
        by: { type: Schema.Types.ObjectId, ref: "User" },
        byRole: { type: String },
        note: { type: String, trim: true, maxlength: 500 },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

// 2dsphere index for geo queries
jobSchema.index({ location: "2dsphere" });
jobSchema.index({ title: "text" });
jobSchema.index({ postedBy: 1 });
jobSchema.index({ assignedTo: 1 });
jobSchema.index({ category: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ status: 1, cancelledAt: -1 });
jobSchema.index({ status: 1, createdAt: 1 });

export const Job = model<TJob>("Job", jobSchema);
