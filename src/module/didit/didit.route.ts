import { Router } from "express";
import auth from "@middlewares/auth";
import { DiditController } from "./didit.controller";

const router = Router();

/**
 * @route   POST /api/v1/didit/session
 * @desc    Create a new Didit KYC session for helper verification
 * @access  Private (authenticated user)
 */
router.post("/session", auth(), DiditController.createSession);

/**
 * @route   POST /api/v1/didit/sync
 * @desc    Direct mobile sync to retrieve latest Didit verification decision
 * @access  Private (authenticated user)
 */
router.post("/sync", auth(), DiditController.syncSession);

/**
 * @route   POST /api/v1/didit/webhook
 * @desc    Receive webhook events from Didit verification platform
 * @access  Public (HMAC signature validated)
 */
router.post("/webhook", DiditController.handleWebhook);

export const DiditRoutes = router;
