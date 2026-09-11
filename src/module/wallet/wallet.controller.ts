import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { WalletService } from "./wallet.service";

const getWalletBalance = catchAsync(async (req, res) => {
  const result = await WalletService.getWalletBalance(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Wallet balance fetched successfully",
    data: result,
  });
});

const listTransactions = catchAsync(async (req, res) => {
  const result = await WalletService.listTransactions(
    req.user?._id as string,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Wallet transactions fetched successfully",
    data: result,
  });
});

const topupWallet = catchAsync(async (req, res) => {
  const result = await WalletService.topupWallet(req.user?._id as string, req.body.amount);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Top-up payment session initialized successfully",
    data: result,
  });
});

export const WalletController = {
  getWalletBalance,
  listTransactions,
  topupWallet,
};
