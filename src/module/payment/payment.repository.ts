import { PaymentStatus, TPaymentTransaction } from "./payment.interface";
import { PaymentTransaction } from "./payment.model";

export const PaymentRepository = {
  create(payload: Partial<TPaymentTransaction>) {
    return PaymentTransaction.create(payload);
  },

  findByTransactionId(transactionId: string) {
    return PaymentTransaction.findOne({ transactionId });
  },

  findByOrderId(orderId: string) {
    return PaymentTransaction.findOne({ orderId });
  },

  findBySessionId(sessionId: string) {
    return PaymentTransaction.findOne({ sessionId });
  },

  updateByTransactionId(transactionId: string, payload: object) {
    return PaymentTransaction.findOneAndUpdate({ transactionId }, payload, {
      returnDocument: "after",
      runValidators: true,
    });
  },

  updateByOrderId(orderId: string, payload: object) {
    return PaymentTransaction.findOneAndUpdate({ orderId }, payload, {
      returnDocument: "after",
      runValidators: true,
    });
  },

  findByUser(userId: string) {
    return PaymentTransaction.find({ user: userId }).sort({ createdAt: -1 });
  },

  /** Mark abandoned pending checkouts older than cutoff as expired. */
  expireStuckPendings(olderThanHours = 24) {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    return PaymentTransaction.updateMany(
      { status: PaymentStatus.PENDING, createdAt: { $lte: cutoff } },
      {
        $set: {
          status: PaymentStatus.EXPIRED,
          "metadata.expiredAt": new Date(),
          "metadata.expiredReason": `Abandoned pending > ${olderThanHours}h`,
        },
      },
    );
  },

  findAll(
    filter: object = {},
    page = 1,
    limit = 20,
    sort: Record<string, 1 | -1> = { createdAt: -1 },
  ) {
    return Promise.all([
      PaymentTransaction.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", "name email avatar")
        .exec(),
      PaymentTransaction.countDocuments(filter).exec(),
    ]);
  },

  findById(id: string) {
    return PaymentTransaction.findById(id).populate("user", "name email avatar");
  },
};
