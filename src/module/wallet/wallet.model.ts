import { Schema, model } from "mongoose";
import { TransactionType, TWallet } from "./wallet.interface";

const walletTransactionSchema = new Schema(
  {
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: Object.values(TransactionType),
      required: true,
    },
    description: { type: String },
    referenceId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const walletSchema = new Schema<TWallet>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "MAD" },
    transactions: [walletTransactionSchema],
  },
  { timestamps: true }
);

walletSchema.index({ user: 1 }, { unique: true });

export const Wallet = model<TWallet>("Wallet", walletSchema);
