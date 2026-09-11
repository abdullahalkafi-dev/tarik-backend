import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { PaymentController } from "./payment.controller";
import { PaymentDto } from "./payment.dto";

const router = Router();

/**
 * @route   POST /api/v1/payment/initialize
 * @desc    Initialize payment checkout session
 * @access  Private
 */
router.post(
  "/initialize",
  auth(),
  validateRequest(PaymentDto.initPayment),
  PaymentController.initializePayment
);

/**
 * @route   POST /api/v1/payment/webhook
 * @desc    Payment Gateway Simulator Webhook listener
 * @access  Public
 */
router.post("/webhook", PaymentController.handleWebhook);

/**
 * @route   GET /api/v1/payment/callback
 * @desc    Payment completion redirect handler
 * @access  Public
 */
router.get("/callback", PaymentController.handleCallback);

/**
 * @route   GET /api/v1/payment
 * @desc    List all payment transactions (Admin)
 * @access  Private (Admin)
 */
router.get("/", auth("superAdmin", "admin", "staff"), PaymentController.getAllPayments);

/**
 * @route   GET /api/v1/payment/stuck
 * @desc    Aging pending (>24h) + failed payments (Admin)
 * @access  Private (Admin)
 */
router.get("/stuck", auth("superAdmin", "admin", "staff"), PaymentController.getStuckPayments);

/**
 * @route   GET /api/v1/payment/:id
 * @desc    Get payment transaction details (Admin)
 * @access  Private (Admin)
 */
router.get("/:id", auth("superAdmin", "admin", "staff"), PaymentController.getPaymentById);

export const PaymentRoutes = router;
