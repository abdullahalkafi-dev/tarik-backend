import { Types } from "mongoose";

export enum JobStatus {
  PENDING_PAYMENT = "pending_payment",
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum BudgetType {
  HOURLY = "hourly",
  FIXED = "fixed",
}

export enum PaymentMethod {
  ONLINE = "online",
  CASH = "cash",
}

export interface TJobLocation {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface TJob {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  date?: Date;
  startTime?: string;
  endTime?: string;
  budget: number;
  budgetType: BudgetType;
  paymentMethod: PaymentMethod;
  status: JobStatus;
  address?: string;
  location?: TJobLocation;
  images: string[];
  postedBy: Types.ObjectId;
  assignedTo?: Types.ObjectId;
  category: Types.ObjectId;
  commissionDeducted?: number;
  cancellationReason?: string;
  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  completedAt?: Date;
  /** True once online escrow has been credited to helper wallet (prevents double-complete credit). */
  escrowCredited?: boolean;
  /** paid | pending | refunded | none — set on offer-created jobs */
  paymentStatus?: string;
  isCustomOffer?: boolean;
  /** Gateway refund outcome for online jobs: none | pending | refunded | failed | wallet_only */
  refundStatus?: string;
  refundReference?: string;
  history?: {
    action: "created" | "accepted" | "completed" | "cancelled" | "payment_open" | "refunded";
    by?: Types.ObjectId;
    byRole?: string;
    note?: string;
    at: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}
