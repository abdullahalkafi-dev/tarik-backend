import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { WalletRepository } from "./wallet.repository";
import { PaymentService } from "module/payment/payment.service";

const getWalletBalance = async (userId: string) => {
  const wallet = await WalletRepository.getOrCreateWallet(userId);
  // Recent snapshot only — full history via listTransactions
  const recent = await WalletRepository.listTransactions(userId, 1, 20);
  return {
    balance: wallet.balance,
    currency: wallet.currency,
    transactions: recent.docs,
    // Lifetime totals per type (the list above is only the latest page).
    totals: await WalletRepository.totalsByType(userId),
  };
};

const listTransactions = async (
  userId: string,
  page = 1,
  limit = 20,
  type?: string,
) => {
  return WalletRepository.listTransactions(userId, page, limit, type);
};

const topupWallet = async (userId: string, amount: number) => {
  if (amount <= 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Amount must be greater than 0");
  }

  // Generate payment checkout session via Payment Simulator
  const tempOrderId = "topup_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);
  const paymentSession = await PaymentService.initializePayment(userId, {
    amount,
    orderId: tempOrderId,
    orderType: "wallet_topup",
    metadata: { userId },
  });

  return paymentSession;
};

export const WalletService = {
  getWalletBalance,
  listTransactions,
  topupWallet,
};
