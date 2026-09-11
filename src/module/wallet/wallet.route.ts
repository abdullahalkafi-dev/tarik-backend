import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { WalletController } from "./wallet.controller";
import { WalletDto } from "./wallet.dto";

const router = Router();

/**
 * @route   GET /api/v1/wallet/balance
 * @desc    Get current user's wallet balance and transactions
 * @access  Private
 */
router.get("/balance", auth(), WalletController.getWalletBalance);

/**
 * @route   GET /api/v1/wallet/transactions
 * @desc    Paginated wallet transaction history (ledger)
 * @access  Private
 */
router.get("/transactions", auth(), WalletController.listTransactions);

/**
 * @route   POST /api/v1/wallet/topup
 * @desc    Initialize wallet top-up payment session
 * @access  Private
 */
router.post(
  "/topup",
  auth(),
  validateRequest(WalletDto.topup),
  WalletController.topupWallet
);

export const WalletRoutes = router;
