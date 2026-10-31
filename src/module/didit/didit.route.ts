import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { createContentLimiter } from "@middlewares/security";
import { DiditController } from "./didit.controller";
import { DiditDto } from "./didit.dto";

const router = Router();

/**
 * @route   POST /api/v1/didit/session
 * @desc    Create a new Didit KYC session for helper verification
 * @access  Private (authenticated user)
 */
router.post("/session", auth(), createContentLimiter, DiditController.createSession);

/**
 * @route   POST /api/v1/didit/sync
 * @desc    Direct mobile sync to retrieve latest Didit verification decision
 * @access  Private (authenticated user)
 */
router.post("/sync", auth(), validateRequest(DiditDto.sync), DiditController.syncSession);

/**
 * @route   POST /api/v1/didit/webhook
 * @desc    Receive webhook events from Didit verification platform
 * @access  Public (HMAC signature validated)
 */
router.post("/webhook", DiditController.handleWebhook);

/**
 * @route   GET /api/v1/didit/webhook
 * @route   GET /api/v1/didit/callback
 * @desc    Browser redirect completion endpoint from Didit KYC flow
 * @access  Public
 */
router.get("/webhook", DiditController.handleCallback);
router.get("/callback", DiditController.handleCallback);

export const DiditRoutes = router;
