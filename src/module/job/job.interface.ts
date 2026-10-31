import { Types } from "mongoose";

export enum JobStatus {
  PENDING_PAYMENT = "pending_payment",
  OPEN = "open",
  ON_THE_WAY = "on_the_way",
  ARRIVED = "arrived",
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

/** Statuses in which a helper is assigned and the work is under way. */
export const ACTIVE_JOB_STATUSES = [
  JobStatus.IN_PROGRESS,
  JobStatus.ON_THE_WAY,
  JobStatus.ARRIVED,
];

export interface TJob {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  date?: Date;
  startTime?: string;
  endTime?: string;
  /** Real start / end instants (Africa/Casablanca interpretation of date + times). */
  startAt?: Date;
  endAt?: Date;
  /**
   * TOTAL amount of the job in MAD. For hourly jobs this is hourlyRate × hours
   * (computed by the server) — it is what is charged online, what the 20 %
   * commission is based on and what the helper's payout is based on.
   */
  budget: number;
  hourlyRate?: number;
  hours?: number;
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
  /** Commission % in force when the helper accepted (later fee changes never touch this job). */
  feePercentage?: number;
  /** Net amount the helper receives for an online job (budget − commission), fixed at accept time. */
  helperNet?: number;
  acceptedAt?: Date;
  onTheWayAt?: Date;
  arrivedAt?: Date;
  /** The helper says the work is done; the client has to confirm (or it auto-completes). */
  helperFinishedAt?: Date;
  autoCompleteAt?: Date;
  /** A problem was reported: automatic completion/payout is paused until support decides. */
  disputeOpen?: boolean;
  /** "Your job starts soon" reminder was sent. */
  reminderSentAt?: Date;
  /** Helpers who were sent this job as "new nearby" (so they can be told when it is taken). */
  notifiedHelpers?: Types.ObjectId[];
  cancellationReason?: string;
  cancellationCode?: string;
  cancelledByRole?: "client" | "helper" | "admin" | "system";
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
    action:
      | "created"
      | "accepted"
      | "on_the_way"
      | "arrived"
      | "finished"
      | "completed"
      | "auto_completed"
      | "cash_confirmed"
      | "cancelled"
      | "edited"
      | "dispute"
      | "payment_open"
      | "refunded";
    by?: Types.ObjectId;
    byRole?: string;
    note?: string;
    at: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}
