import { Types } from "mongoose";
import { TransactionType, TWallet } from "./wallet.interface";
import { Wallet } from "./wallet.model";
import { WalletTransactionLedger } from "./walletTransaction.model";

/** Keep a small recent snapshot on the wallet doc for quick UI. */
const MAX_WALLET_SNAPSHOT = 20;

const appendLedger = async (
  userId: string,
  walletId: Types.ObjectId | undefined,
  entry: {
    amount: number;
    type: TransactionType;
    description?: string;
    referenceId?: string;
    balanceAfter?: number;
  },
) => {
  await WalletTransactionLedger.create({
    user: userId,
    wallet: walletId,
    ...entry,
    createdAt: new Date(),
  });
};

const insufficient = (balance: number, amount: number) =>
  new Error(
    `Insufficient wallet balance (${balance} MAD). Required: ${amount} MAD.`,
  );

export const WalletRepository = {
  async getOrCreateWallet(userId: string): Promise<any> {
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
  },

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
      return this.getOrCreateWallet(userId);
    }
    await this.getOrCreateWallet(userId);

    const description = `Recharge wallet top-up (+${amount} MAD)`;
    const entry = {
      amount,
      type: TransactionType.TOPUP,
      description,
      referenceId,
      createdAt: new Date(),
    };

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: { balance: amount },
        $push: { transactions: { $each: [entry], $slice: -MAX_WALLET_SNAPSHOT } },
      },
      { new: true },
    ).exec();

    if (!wallet) {
      throw new Error("Wallet not found for top-up");
    }

    await appendLedger(userId, wallet._id, {
      amount,
      type: TransactionType.TOPUP,
      description,
      referenceId,
      balanceAfter: wallet.balance,
    });
    return wallet;
  },

  /** Job escrow release — earning, not a recharge. Idempotent via referenceId. */
  async creditEarning(
    userId: string,
    amount: number,
    referenceId?: string,
    description?: string,
  ): Promise<TWallet> {
    if (amount <= 0) return this.getOrCreateWallet(userId);
    if (referenceId && (await this.hasEarningReference(userId, referenceId))) {
      return this.getOrCreateWallet(userId);
    }
    await this.getOrCreateWallet(userId);

    const desc = description || `Job payout (+${amount} MAD)`;
    const entry = {
      amount,
      type: TransactionType.EARNING_PAYOUT,
      description: desc,
      referenceId,
      createdAt: new Date(),
    };

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: { balance: amount },
        $push: { transactions: { $each: [entry], $slice: -MAX_WALLET_SNAPSHOT } },
      },
      { new: true },
    ).exec();

    if (!wallet) {
      throw new Error("Wallet not found for earning credit");
    }

    await appendLedger(userId, wallet._id, {
      amount,
      type: TransactionType.EARNING_PAYOUT,
      description: desc,
      referenceId,
      balanceAfter: wallet.balance,
    });
    return wallet;
  },

  async hasEarningReference(userId: string, referenceId: string): Promise<boolean> {
    if (!referenceId) return false;
    const hit = await WalletTransactionLedger.findOne({
      user: userId,
      referenceId,
      type: TransactionType.EARNING_PAYOUT,
    }).select("_id");
    if (hit) return true;
    const wallet = await Wallet.findOne({
      user: userId,
      "transactions.referenceId": referenceId,
      "transactions.type": TransactionType.EARNING_PAYOUT,
    }).select("_id");
    return Boolean(wallet);
  },

  async deductCommission(userId: string, amount: number, jobId: string): Promise<TWallet> {
    await this.getOrCreateWallet(userId);

    const description = `Platform commission for Job #${jobId}`;
    const entry = {
      amount: -amount,
      type: TransactionType.COMMISSION_DEDUCTION,
      description,
      referenceId: jobId,
      createdAt: new Date(),
    };

    // Atomic: only succeeds if balance covers the commission
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amount } },
      {
        $inc: { balance: -amount },
        $push: { transactions: { $each: [entry], $slice: -MAX_WALLET_SNAPSHOT } },
      },
      { new: true },
    ).exec();

    if (!wallet) {
      const existing = await Wallet.findOne({ user: userId }).select("balance").lean();
      const balance = existing?.balance ?? 0;
      throw insufficient(balance, amount);
    }

    await appendLedger(userId, wallet._id, {
      amount: -amount,
      type: TransactionType.COMMISSION_DEDUCTION,
      description,
      referenceId: jobId,
      balanceAfter: wallet.balance,
    });

    try {
      const { notifyUser } = await import("util/notifyUser");
      notifyUser(
        userId,
        "Commission deducted",
        `${amount} MAD commission was deducted for job ${jobId}.`,
        { type: "payment_success", orderType: "commission", jobId },
      ).catch(() => {});
    } catch (_) {}

    return wallet;
  },

  async refundCommission(userId: string, amount: number, jobId: string): Promise<TWallet> {
    await this.getOrCreateWallet(userId);

    const description = `Refund commission for cancelled Job #${jobId}`;
    const entry = {
      amount,
      type: TransactionType.COMMISSION_REFUND,
      description,
      referenceId: jobId,
      createdAt: new Date(),
    };

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: { balance: amount },
        $push: { transactions: { $each: [entry], $slice: -MAX_WALLET_SNAPSHOT } },
      },
      { new: true },
    ).exec();

    if (!wallet) {
      throw new Error("Wallet not found for commission refund");
    }

    await appendLedger(userId, wallet._id, {
      amount,
      type: TransactionType.COMMISSION_REFUND,
      description,
      referenceId: jobId,
      balanceAfter: wallet.balance,
    });

    try {
      const { notifyUser } = await import("util/notifyUser");
      notifyUser(
        userId,
        "Commission refunded",
        `${amount} MAD was refunded to your wallet for cancelled job ${jobId}.`,
        { type: "payment_success", orderType: "commission_refund", jobId },
      ).catch(() => {});
    } catch (_) {}

    return wallet;
  },

  /** Paginated history from ledger (preferred) with legacy fallback. */
  async listTransactions(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    docs: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      WalletTransactionLedger.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      WalletTransactionLedger.countDocuments({ user: userId }).exec(),
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

    const wallet = await this.getOrCreateWallet(userId);
    const all = [...(wallet.transactions || [])].reverse();
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
