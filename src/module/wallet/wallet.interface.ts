import { Types } from "mongoose";

export enum TransactionType {
  TOPUP = "topup",
  COMMISSION_DEDUCTION = "commission_deduction",
  COMMISSION_REFUND = "commission_refund",
  EARNING_PAYOUT = "earning_payout",
}

export interface TWalletTransaction {
  _id?: Types.ObjectId;
  amount: number;
  type: TransactionType;
  description?: string;
  referenceId?: string;
  createdAt: Date;
}

export interface TWallet {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  balance: number; // in MAD
  currency: string;
  transactions: TWalletTransaction[];
  createdAt: Date;
  updatedAt: Date;
}
