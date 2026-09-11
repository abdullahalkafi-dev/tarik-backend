import { Schema, model } from "mongoose";
import { OrderType, PaymentStatus, TPaymentTransaction } from "./payment.interface";

const paymentTransactionSchema = new Schema<TPaymentTransaction>(
  {
    transactionId: { type: String, required: true, unique: true },
    orderId: { type: String, required: true },
    orderType: {
      type: String,
      enum: Object.values(OrderType),
      required: true,
    },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "MAD" },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    paymentMethod: { type: String, default: "online" },
    sessionId: { type: String },
    checkoutUrl: { type: String },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ user: 1 });
paymentTransactionSchema.index({ transactionId: 1 }, { unique: true });
paymentTransactionSchema.index({ orderId: 1 });
paymentTransactionSchema.index({ status: 1, createdAt: -1 });
paymentTransactionSchema.index({ orderId: 1, status: 1 });

export const PaymentTransaction = model<TPaymentTransaction>(
  "PaymentTransaction",
  paymentTransactionSchema
);
