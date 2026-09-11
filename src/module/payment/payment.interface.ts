import { Types } from "mongoose";

export enum PaymentStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  REFUNDED = "refunded",
  EXPIRED = "expired",
}

export enum OrderType {
  JOB = "job",
  OFFER = "offer",
  WALLET_TOPUP = "wallet_topup",
}

export interface TPaymentTransaction {
  _id: Types.ObjectId;
  transactionId: string;
  orderId: string;
  orderType: OrderType;
  user: Types.ObjectId;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string;
  sessionId?: string;
  checkoutUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
