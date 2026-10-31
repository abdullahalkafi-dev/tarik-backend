import { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errors/AppError";
import { TransactionType, TWallet } from "./wallet.interface";
import { Wallet } from "./wallet.model";
import { WalletTransactionLedger } from "./walletTransaction.model";
import { renderTemplate } from "../../util/notificationTemplates";

/** Keep a small recent snapshot on the wallet doc for quick UI. */
const MAX_WALLET_SNAPSHOT = 20;

const insufficient = (balance: number, amount: number) =>
  new AppError(
    StatusCodes.BAD_REQUEST,
    `Insufficient wallet balance (${balance} MAD). Required: ${amount} MAD.`,
    { code: "INSUFFICIENT_BALANCE", params: { balance, required: amount } },
  );

type TChange = {
  userId: string;
  /** positive = credit, negative = debit */
  delta: number;
  type: TransactionType;
  description: string;
  referenceId?: string;
};

const getOrCreateWallet = async (userId: string): Promise<any> => {
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    try {
      wallet = await Wallet.create({ user: userId, balance: 0, transactions: [] });
    } catch (err: any) {
      // Unique index race — another request created it first
      if (err?.code === 11000) {
        wallet = await Wallet.findOne({ user: userId });
      } else {
        throw err;
      }
    }
  }
  return wallet;
};

/**
 * One money movement, idempotent and never half-applied:
 *  1. write the ledger row (unique per user+reference+type — a replay stops here),
 *  2. change the balance atomically (debits only succeed if the balance covers them),
 *  3. confirm the ledger row. If step 2 fails the ledger row is removed again.
 */
const applyChange = async (change: TChange): Promise<TWallet> => {
  const wallet = await getOrCreateWallet(change.userId);

  let ledger: any;
  try {
    ledger = await WalletTransactionLedger.create({
      user: change.userId,
      wallet: wallet._id,
      amount: change.delta,
      type: change.type,
      description: change.description,
      referenceId: change.referenceId,
      applied: false,
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      // Same movement already recorded: do nothing, return the current wallet.
      return (await getOrCreateWallet(change.userId)) as TWallet;
    }
    throw err;
  }

  const filter: Record<string, unknown> = { user: change.userId };
  if (change.delta < 0) filter.balance = { $gte: Math.abs(change.delta) };

  const entry = {
    amount: change.delta,
    type: change.type,
    description: change.description,
    referenceId: change.referenceId,
    createdAt: new Date(),
  };

  let updated: any;
  try {
    updated = await Wallet.findOneAndUpdate(
      filter,
      {
        $inc: { balance: change.delta },
        $push: { transactions: { $each: [entry], $slice: -MAX_WALLET_SNAPSHOT } },
      },
      { returnDocument: "after" },
    ).exec();
  } catch (err) {
    await WalletTransactionLedger.deleteOne({ _id: ledger._id }).catch(() => undefined);
    throw err;
  }

  if (!updated) {
    await WalletTransactionLedger.deleteOne({ _id: ledger._id }).catch(() => undefined);
    if (change.delta < 0) {
      const current = await Wallet.findOne({ user: change.userId }).select("balance").lean();
      throw insufficient(current?.balance ?? 0, Math.abs(change.delta));
    }
    throw new Error("Wallet not found");
  }

  await WalletTransactionLedger.updateOne(
    { _id: ledger._id },
    { $set: { applied: true, balanceAfter: updated.balance } },
  );
  return updated;
};

const whatLabel = (isOffer: boolean, locale?: string) =>
  renderTemplate(isOffer ? "wallet.what_offer" : "wallet.what_job", locale).body;

const notifyMovement = async (
  userId: string,
  template: "commission.deducted" | "commission.refunded",
  amount: number,
  referenceId: string,
) => {
  try {
    const { notifyUserT } = await import("../../util/notifyUser");
    const { UserRepository } = await import("../user/user.repository");
    const user = await UserRepository.findById(userId, { select: "locale" });
    const isOffer = referenceId.startsWith("offer_");
    const cleanId = referenceId.replace(/^offer_/, "").split(":")[0];
    notifyUserT(
      userId,
      template,
      { amount, what: `${whatLabel(isOffer, user?.locale)} #${cleanId.slice(-6)}` },
      {
        type: "payment_success",
        orderType: template === "commission.deducted" ? "commission" : "commission_refund",
        jobId: referenceId,
      },
    ).catch(() => undefined);
  } catch (_) {
    // notification is best effort
  }
};

export const WalletRepository = {
  getOrCreateWallet,

  /** Whether a top-up with this referenceId already exists (webhook idempotency). */
  async hasTopupReference(userId: string, referenceId: string): Promise<boolean> {
    if (!referenceId) return false;
    const hit = await WalletTransactionLedger.findOne({
      user: userId,
      referenceId,
      type: TransactionType.TOPUP,
    }).select("_id");
    if (hit) return true;
    const wallet = await Wallet.findOne({
      user: userId,
      "transactions.referenceId": referenceId,
      "transactions.type": TransactionType.TOPUP,
    }).select("_id");
    return Boolean(wallet);
  },

  async topup(userId: string, amount: number, referenceId?: string): Promise<TWallet> {
    if (referenceId && (await this.hasTopupReference(userId, referenceId))) {
      return getOrCreateWallet(userId);
    }
    return applyChange({
      userId,
      delta: amount,
      type: TransactionType.TOPUP,
      description: `Recharge wallet top-up (+${amount} MAD)`,
      referenceId,
    });
  },

  /** Job escrow release — earning, not a recharge. Idempotent via referenceId. */
  async creditEarning(
    userId: string,
    amount: number,
    referenceId?: string,
    description?: string,
  ): Promise<TWallet> {
    if (amount <= 0) return getOrCreateWallet(userId);
    return applyChange({
      userId,
      delta: amount,
      type: TransactionType.EARNING_PAYOUT,
      description: description || `Job payout (+${amount} MAD)`,
      referenceId,
    });
  },

  async hasEarningReference(userId: string, referenceId: string): Promise<boolean> {
    if (!referenceId) return false;
    const hit = await WalletTransactionLedger.findOne({
      user: userId,
      referenceId,
      type: TransactionType.EARNING_PAYOUT,
    }).select("_id");
    return Boolean(hit);
  },

  /**
   * Prepay the platform commission. `jobId` may be a job id, `offer_<id>`, or
   * an adjustment reference such as `offer_<id>:v2`.
   */
  async deductCommission(userId: string, amount: number, jobId: string): Promise<TWallet> {
    const isOffer = jobId.startsWith("offer_");
    const cleanId = jobId.replace(/^offer_/, "");
    const wallet = await applyChange({
      userId,
      delta: -amount,
      type: TransactionType.COMMISSION_DEDUCTION,
      description: isOffer
        ? `Platform commission for offer #${cleanId}`
        : `Platform commission for Job #${jobId}`,
      referenceId: jobId,
    });
    await notifyMovement(userId, "commission.deducted", amount, jobId);
    return wallet;
  },

  async refundCommission(userId: string, amount: number, jobId: string): Promise<TWallet> {
    const isOffer = jobId.startsWith("offer_");
    const cleanId = jobId.replace(/^offer_/, "");
    const wallet = await applyChange({
      userId,
      delta: amount,
      type: TransactionType.COMMISSION_REFUND,
      description: isOffer
        ? `Refund commission for offer #${cleanId}`
        : `Refund commission for cancelled Job #${jobId}`,
      referenceId: jobId,
    });
    await notifyMovement(userId, "commission.refunded", amount, jobId);
    return wallet;
  },

  /** Lifetime totals per movement type (confirmed rows only), e.g. { topup: 200, earning_payout: 850 }. */
  async totalsByType(userId: string): Promise<Record<string, number>> {
    const rows = await WalletTransactionLedger.aggregate([
      { $match: { user: new Types.ObjectId(userId), applied: { $ne: false } } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]).exec();
    const out: Record<string, number> = {};
    for (const r of rows) out[String(r._id)] = Math.round(Number(r.total) * 100) / 100;
    return out;
  },

  /** Paginated history from the ledger, with a fallback to the embedded snapshot. */
  async listTransactions(
    userId: string,
    page = 1,
    limit = 20,
    type?: string,
  ): Promise<{
    docs: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { user: new Types.ObjectId(userId), applied: { $ne: false } };
    if (type) filter.type = type;
    const [docs, total] = await Promise.all([
      WalletTransactionLedger.find(filter as any)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      WalletTransactionLedger.countDocuments(filter as any).exec(),
    ]);

    if (total > 0) {
      return {
        docs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    const wallet = await getOrCreateWallet(userId);
    const all = [...(wallet.transactions || [])].reverse().filter((t: any) => !type || t.type === type);
    const slice = all.slice(skip, skip + limit);
    return {
      docs: slice,
      total: all.length,
      page,
      limit,
      totalPages: Math.ceil(all.length / limit) || 1,
    };
  },
};
