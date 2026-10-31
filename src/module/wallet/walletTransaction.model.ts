import { Schema, model, Types } from "mongoose";
import { TransactionType } from "./wallet.interface";

/**
 * Standalone wallet transaction ledger.
 * Keeps Wallet document small; supports pagination and indexes.
 *
 * Every balance change is written here FIRST (`applied: false`), then the
 * balance is updated, then the row is marked `applied: true`. The unique index
 * on (user, referenceId, type) makes every money movement idempotent: a retried
 * request or a repeated webhook can never credit/refund the same thing twice.
 */
const walletTransactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    wallet: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
      index: true,
    },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
    },
    description: { type: String },
    referenceId: { type: String, index: true },
    balanceAfter: { type: Number },
    /** false = written but the balance update has not been confirmed (reconciliation watches these). */
    applied: { type: Boolean },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index(
  { user: 1, referenceId: 1, type: 1 },
  { unique: true, partialFilterExpression: { referenceId: { $type: "string" } } },
);

export const WalletTransactionLedger = model<
  {
    user: Types.ObjectId;
    wallet?: Types.ObjectId;
    amount: number;
    type: TransactionType;
    description?: string;
    referenceId?: string;
    balanceAfter?: number;
    applied?: boolean;
    createdAt: Date;
  }
>("WalletTransactionLedger", walletTransactionSchema);
