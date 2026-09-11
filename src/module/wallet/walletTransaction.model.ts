import { Schema, model, Types } from "mongoose";
import { TransactionType } from "./wallet.interface";

/**
 * Standalone wallet transaction ledger.
 * Keeps Wallet document small; supports pagination and indexes.
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
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ user: 1, referenceId: 1, type: 1 });

export const WalletTransactionLedger = model<
  {
    user: Types.ObjectId;
    wallet?: Types.ObjectId;
    amount: number;
    type: TransactionType;
    description?: string;
    referenceId?: string;
    balanceAfter?: number;
    createdAt: Date;
  }
>("WalletTransactionLedger", walletTransactionSchema);
