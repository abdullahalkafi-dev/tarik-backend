import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errors/AppError";
import config from "../../config";
import redisClient from "../../redis/redisClient";
import cacheService from "../../redis/cacheService";
import { buildCacheKey } from "../../redis/cache.utils";
import { UserRepository } from "../user/user.repository";
import { AuthRepository } from "../auth/auth.repository";
import { BlacklistedDocument } from "../admin/blacklistedDocument.model";
import { HelperApplicationStatus } from "../user/user.interface";
import { AuthRole } from "../auth/auth.interface";
import { disconnectUserSockets } from "../../socket/socket.gateway";
import { notifyUser } from "../../util/notifyUser";

const DIDIT_BASE_URL = "https://verification.didit.me/v3";
const MAX_SESSIONS_PER_DAY = 5;

// Whole-number floats (1.0) -> integers (1), recursively. Matches Didit's canonicalisation.
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)]),
    );
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

// Recursive lexicographic key sort (array order preserved).
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

/**
 * Creates a Didit KYC session for a helper applicant.
 * Authenticates with x-api-key header and enforces rate limits.
 */
const createSession = async (userId: string) => {
  const today = new Date().toISOString().slice(0, 10);
  const rateKey = `didit:session_cap:${userId}:${today}`;

  const currentCount = await redisClient.get(rateKey);
  const count = currentCount ? parseInt(currentCount, 10) : 0;

  if (count >= MAX_SESSIONS_PER_DAY) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      "Daily verification attempt limit reached. Please try again tomorrow or contact support.",
    );
  }

  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  try {
    const response = await fetch(`${DIDIT_BASE_URL}/session/`, {
      method: "POST",
      headers: {
        "x-api-key": config.didit.api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflow_id: config.didit.workflow_id,
        vendor_data: String(userId),
        callback: `${config.urls.api_base_url}/api/v1/webhooks/didit`,
        redirect_url: `${config.urls.api_base_url}/api/v1/webhooks/didit`,
        return_url: `${config.urls.api_base_url}/api/v1/webhooks/didit`,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[DIDIT ERROR] Create session failed:", response.status, errBody);
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        `Didit KYC session creation failed (${response.status}): ${errBody}`,
      );
    }

    const data = (await response.json()) as any;
    const sessionId = data.session_id || data.id;
    const sessionUrl = data.url || data.session_url;

    // Increment daily rate limit (24 hours TTL)
    if (count === 0) {
      await redisClient.set(rateKey, "1", 86400);
    } else {
      await redisClient.set(rateKey, String(count + 1), 86400);
    }

    // Persist sessionId on user
    await UserRepository.updateById(userId, {
      diditSessionId: sessionId,
      diditStatus: "In Progress",
    });

    return {
      sessionId,
      url: sessionUrl,
      attemptsRemaining: MAX_SESSIONS_PER_DAY - (count + 1),
    };
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      `Didit KYC initialization failed: ${error.message}`,
    );
  }
};

/**
 * Validates HMAC raw-buffer / V2 canonical signature and timestamp freshness.
 */
const verifyWebhookSignature = (
  headers: Record<string, any>,
  rawBody: string,
  parsedPayload?: any,
): void => {
  // Allow development bypass if sandbox_secret is used in non-production
  if (config.didit.webhook_secret === "sandbox_secret" && config.node_env !== "production") {
    return;
  }

  const sigV2 = headers["x-signature-v2"];
  const sigRaw = headers["x-signature"] || headers["x-didit-signature"] || headers["x-signature-sha256"];
  const signature = sigV2 || sigRaw;

  if (!signature || typeof signature !== "string") {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Missing webhook signature header");
  }

  // 1. Freshness check: abs(now - X-Timestamp) <= 300 seconds
  const rawTimestamp = headers["x-timestamp"] || headers["x-request-timestamp"];
  if (rawTimestamp) {
    let ts = Number(rawTimestamp);
    if (!isNaN(ts)) {
      if (ts > 10000000000) {
        ts = Math.floor(ts / 1000); // convert ms to seconds
      }
      const nowSec = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSec - ts) > 300) {
        throw new AppError(
          StatusCodes.UNAUTHORIZED,
          "Webhook timestamp drift exceeds 300 seconds window",
        );
      }
    }
  }

  // 2. Canonicalise (shortenFloats -> sortKeys -> JSON.stringify with unescaped Unicode)
  let expectedSignature: string;
  if (sigV2 && parsedPayload) {
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsedPayload)));
    expectedSignature = crypto
      .createHmac("sha256", config.didit.webhook_secret)
      .update(canonical, "utf8")
      .digest("hex");
  } else {
    expectedSignature = crypto
      .createHmac("sha256", config.didit.webhook_secret)
      .update(rawBody || "", "utf8")
      .digest("hex");
  }

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  // 3. Constant-time HMAC comparison
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid webhook HMAC signature");
  }
};

/**
 * Evaluates Didit decision payload (V3 plural arrays) and updates User & Auth records.
 */
const processDecisionInternal = async (
  userId: string,
  decision: any,
  overallStatus?: string,
): Promise<{ status: string; autoBanned?: boolean }> => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    return { status: "user_not_found" };
  }

  // 1. Biometric Face Match Normalization (V3 plural arrays)
  const faceMatch = decision?.face_matches?.[0] || decision?.face_match || decision?.biometrics;
  const rawScore = faceMatch?.score ?? 0;
  const confidenceScore = rawScore <= 1 ? Math.round(rawScore * 100) : Math.round(rawScore);
  const isBiometricMatch = confidenceScore >= 80 || faceMatch?.status === "Approved" || faceMatch?.status === "passed";

  // 2. Liveness Check (V3 plural arrays)
  const livenessCheck = decision?.liveness_checks?.[0] || decision?.liveness_check || decision?.liveness;
  const livenessPassed =
    livenessCheck?.status === "Passed" ||
    livenessCheck?.status === "passed" ||
    livenessCheck?.status === "Approved" ||
    livenessCheck?.passed === true ||
    (livenessCheck?.score != null && livenessCheck.score >= 0.7);

  // 3. OCR Document Normalization & Blacklist Hash (V3 plural arrays)
  const idDoc = decision?.id_verifications?.[0] || decision?.documents?.[0] || decision?.document || decision?.ocr;
  const rawDocNumber = idDoc?.document_number || "";
  const firstName = idDoc?.first_name || "";
  const lastName = idDoc?.last_name || "";
  const ocrName = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : undefined;

  let documentHash: string | undefined;
  let maskedDocumentNumber: string | undefined;

  if (rawDocNumber) {
    const normalizedDoc = rawDocNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    documentHash = crypto.createHash("sha256").update(normalizedDoc).digest("hex");

    maskedDocumentNumber =
      normalizedDoc.length >= 4
        ? `${normalizedDoc.slice(0, 2)}****${normalizedDoc.slice(-2)}`
        : normalizedDoc;

    // Document-Level Blacklist Auto-Ban Check
    const blacklistHit = await BlacklistedDocument.findOne({ documentHash });
    if (blacklistHit) {
      console.warn(`[SECURITY AUTO-BAN] User ${userId} matched blacklisted doc hash: ${documentHash}`);

      await AuthRepository.updateById(String(user.auth), {
        isBlacklisted: true,
        isBlocked: true,
        blacklistedReason: "Fraudulent identity document match in security database",
        blacklistedAt: new Date(),
      });

      await UserRepository.updateById(userId, {
        isBlocked: true,
        helperApplicationStatus: HelperApplicationStatus.REJECTED,
        diditStatus: "Declined",
        diditDecisionReason: "Flagged identity document violating security policy",
        documentNumberHash: documentHash,
        maskedDocumentNumber,
        appealStatus: "max_exceeded",
        $push: {
          adminActionHistory: {
            action: "AUTO_BLACK_LIST_DOCUMENT_HIT",
            adminId: user.auth,
            reason: `Automatic ban: Scanned identity document matches blacklisted record (${blacklistHit.reason})`,
            previousStatus: user.helperApplicationStatus || "pending",
            newStatus: "rejected",
            timestamp: new Date(),
          },
        },
      });

      disconnectUserSockets(userId);
      await cacheService.deleteCache(buildCacheKey("user", "me", userId));
      notifyUser(
        userId,
        "Verification failed",
        "Your identity verification was declined. Contact support if you believe this is a mistake.",
        { type: "kyc_rejected", status: "auto_banned" },
      ).catch(() => {});
      return { status: "auto_banned_blacklisted_document", autoBanned: true };
    }
  }

  // 4. Decision Evaluation
  const statusString = overallStatus || decision?.status || "Declined";
  const isApproved =
    statusString === "Approved" ||
    (statusString.toLowerCase() === "approved" && (isBiometricMatch || livenessPassed));

  if (isApproved) {
    // Auto-Approve Helper
    await UserRepository.updateById(userId, {
      helperApplicationStatus: HelperApplicationStatus.APPROVED,
      isHelperFormSubmitted: true,
      diditStatus: "Approved",
      diditDecisionReason: "Automated KYC Verification Passed",
      rejectionReason: null,
      documentNumberHash: documentHash || user.documentNumberHash,
      maskedDocumentNumber: maskedDocumentNumber || user.maskedDocumentNumber,
      diditDiagnostics: {
        faceMatchScore: confidenceScore,
        livenessScore: livenessCheck?.score ? Math.round(livenessCheck.score * 100) : 100,
        livenessPassed: true,
        ocrName,
        warnings: decision?.warnings || [],
      },
    });

    // Promote Auth role to helper
    await AuthRepository.updateById(String(user.auth), {
      role: AuthRole.HELPER,
    });

    notifyUser(
      userId,
      "KYC approved",
      "Your identity verification passed. You can start taking jobs.",
      { type: "kyc_approved", status: "approved" },
    ).catch(() => {});
  } else if (statusString === "In Review") {
    await UserRepository.updateById(userId, {
      helperApplicationStatus: HelperApplicationStatus.PENDING,
      diditStatus: "In Review",
      diditDecisionReason: "Identity verification is under manual compliance review",
      documentNumberHash: documentHash || user.documentNumberHash,
      maskedDocumentNumber: maskedDocumentNumber || user.maskedDocumentNumber,
      diditDiagnostics: {
        faceMatchScore: confidenceScore,
        livenessScore: livenessCheck?.score ? Math.round(livenessCheck.score * 100) : 0,
        livenessPassed,
        ocrName,
        warnings: decision?.warnings || [],
      },
    });

    notifyUser(
      userId,
      "Verification in review",
      "Your identity verification is under review. We'll notify you when it's done.",
      { type: "kyc_pending", status: "in_review" },
    ).catch(() => {});
  } else {
    // Declined / Rejected
    const reason =
      decision?.decline_reason ||
      decision?.reason ||
      (!isBiometricMatch ? "Face match score below threshold" : "Liveness or document scan failed");

    await UserRepository.updateById(userId, {
      helperApplicationStatus: HelperApplicationStatus.REJECTED,
      diditStatus: statusString || "Declined",
      diditDecisionReason: reason,
      rejectionReason: reason,
      documentNumberHash: documentHash || user.documentNumberHash,
      maskedDocumentNumber: maskedDocumentNumber || user.maskedDocumentNumber,
      appealStatus: user.appealCount >= 3 ? "max_exceeded" : "none",
      diditDiagnostics: {
        faceMatchScore: confidenceScore,
        livenessScore: livenessCheck?.score ? Math.round(livenessCheck.score * 100) : 0,
        livenessPassed,
        ocrName,
        warnings: decision?.warnings || [],
      },
      $push: {
        applicationHistory: {
          appliedAt: new Date(),
          status: HelperApplicationStatus.REJECTED,
          rejectionReason: reason,
          reviewedAt: new Date(),
        },
      },
    });

    const reasonPreview =
      reason && reason.length > 80 ? `${reason.slice(0, 80)}…` : reason;
    notifyUser(
      userId,
      "Verification declined",
      reasonPreview || "Your identity verification was declined.",
      { type: "kyc_rejected", status: "rejected" },
    ).catch(() => {});
  }

  // Invalidate User Profile Cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return {
    status: isApproved ? "approved" : (statusString === "In Review" ? "in_review" : "rejected"),
    autoBanned: false,
  };
};

/**
 * Webhook entry point handling Didit webhook POST requests.
 */
const handleWebhook = async (
  headers: Record<string, any>,
  rawBody: string,
  payload: any,
) => {
  // 1. Verify HMAC & Timestamp
  verifyWebhookSignature(headers, rawBody, payload);

  // 2. Atomic SET NX Idempotency
  const eventId =
    payload.event_id || payload.session_id || payload.id || headers["x-event-id"];
  if (eventId) {
    const isNew = await redisClient.setNX(`didit:event:${eventId}`, "1", 86400);
    if (!isNew) {
      return { status: "duplicate_event_acknowledged" };
    }
  }

  // 3. Extract Vendor Data (User ID)
  const userId = payload.vendor_data;
  if (!userId) {
    return { status: "missing_vendor_data" };
  }

  // 4. Update session status if intermediate
  if (!payload.decision) {
    const sessionStatus = payload.status || "In Progress";
    await UserRepository.updateById(String(userId), {
      diditStatus: sessionStatus,
    });
    return { status: "status_updated", sessionStatus };
  }

  return processDecisionInternal(String(userId), payload.decision, payload.status);
};

/**
 * Mobile instant sync API calling Didit decision endpoint directly.
 */
const syncSession = async (userId: string, sessionId: string) => {
  try {
    const response = await fetch(`${DIDIT_BASE_URL}/session/${sessionId}/decision/`, {
      method: "GET",
      headers: {
        "x-api-key": config.didit.api_key,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        `Failed to fetch session decision from Didit (${response.status}): ${errText}`,
      );
    }

    const decision = (await response.json()) as any;
    return await processDecisionInternal(userId, decision, decision.status);
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      `Didit sync failed: ${error.message}`,
    );
  }
};

export const DiditService = {
  createSession,
  handleWebhook,
  syncSession,
  verifyWebhookSignature,
};

