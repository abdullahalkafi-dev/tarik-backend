import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errors/AppError";
import config from "../../config";
import redisClient from "../../redis/redisClient";
import cacheService from "../../redis/cacheService";
import { buildCacheKey } from "../../redis/cache.utils";
import { UserRepository } from "../user/user.repository";
import { AuthRepository } from "../auth/auth.repository";
import { revokeAllSessions } from "../auth/auth.service";
import { BlacklistedDocument } from "../admin/blacklistedDocument.model";
import { HelperApplicationStatus } from "../user/user.interface";
import { AuthRole } from "../auth/auth.interface";
import { disconnectUserSockets, emitToUser } from "../../socket/socket.gateway";
import { notifyUserT } from "../../util/notifyUser";
import { notifyAdmins } from "../../util/notifyAdmins";
import { logger } from "../../logger/logger";

const DIDIT_BASE_URL = "https://verification.didit.me/v3";
const MAX_SESSIONS_PER_DAY = 5;
const MAX_SESSIONS_LIFETIME = 10;
const MIN_HELPER_AGE = 18;
/** Optional allow-list of document issuing countries (ISO alpha-3, comma separated). Empty = any. */
const allowedDocCountries = () =>
  String(process.env.KYC_ALLOWED_COUNTRIES || "")
    .toUpperCase()
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

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

const normalizeName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

/** 0..1 — share of name words that appear on both the ID and the profile. */
export const nameSimilarity = (a: string, b: string): number => {
  const ta = normalizeName(a);
  const tb = new Set(normalizeName(b));
  if (!ta.length || !tb.size) return 0;
  const hit = ta.filter((t) => tb.has(t)).length;
  return hit / Math.max(ta.length, tb.size);
};

const ageFrom = (dob?: string): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
};

/** A helper profile is complete when everything search / matching needs is present. */
const profileMissing = (user: any): string[] => {
  const missing: string[] = [];
  if (!user.serviceType) missing.push("serviceType");
  if (!user.pricePerHour) missing.push("pricePerHour");
  if (!user.serviceRadius) missing.push("serviceRadius");
  if (!user.location?.coordinates?.length) missing.push("location");
  if (!user.avatar) missing.push("avatar");
  if (!user.age) missing.push("age");
  return missing;
};

/**
 * Creates a Didit KYC session for a helper applicant.
 * Authenticates with x-api-key header and enforces rate limits.
 */
const createSession = async (userId: string) => {
  const user = await UserRepository.findById(userId, { populate: "auth" });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // Banned / blocked people and already approved helpers cannot start (or restart) a check.
  if (user.isBlocked || (user.auth as any)?.isBlacklisted) {
    throw new AppError(StatusCodes.FORBIDDEN, "Account has been suspended.");
  }
  if (user.helperApplicationStatus === HelperApplicationStatus.APPROVED) {
    throw new AppError(StatusCodes.CONFLICT, "Your identity is already verified", { code: "ALREADY_APPROVED" });
  }
  if ((user.diditSessionCount || 0) >= MAX_SESSIONS_LIFETIME) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      "You reached the maximum number of verification attempts. Please contact support.",
      { code: "KYC_ATTEMPTS_EXHAUSTED" },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const rateKey = `didit:session_cap:${userId}:${today}`;
  let dailyCount = 0;
  if (redisClient.isAvailable()) {
    try {
      dailyCount = await redisClient.incrWithWindow(rateKey, 86400);
    } catch {
      dailyCount = 0;
    }
  }
  if (dailyCount > MAX_SESSIONS_PER_DAY) {
    throw new AppError(
      StatusCodes.TOO_MANY_REQUESTS,
      "Daily verification attempt limit reached. Please try again tomorrow or contact support.",
      { code: "KYC_DAILY_LIMIT" },
    );
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
      // The provider's text is logged for us, never returned to the app.
      const errBody = await response.text();
      logger.error(`[DIDIT] create session failed (${response.status}): ${errBody.slice(0, 500)}`);
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        "The identity verification service is unavailable right now. Please try again later.",
        { code: "KYC_PROVIDER_ERROR" },
      );
    }

    const data = (await response.json()) as any;
    const sessionId = data.session_id || data.id;
    const sessionUrl = data.url || data.session_url;

    await UserRepository.updateById(userId, {
      diditSessionId: sessionId,
      diditStatus: "In Progress",
      $inc: { diditSessionCount: 1 },
    });

    return {
      sessionId,
      url: sessionUrl,
      attemptsRemaining: Math.max(0, MAX_SESSIONS_PER_DAY - dailyCount),
    };
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    logger.error(`[DIDIT] session initialization failed: ${error?.message || error}`);
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "The identity verification service is unavailable right now. Please try again later.",
      { code: "KYC_PROVIDER_ERROR" },
    );
  }
};

/**
 * Validates HMAC raw-buffer / V2 canonical signature and timestamp freshness.
 * Without a configured secret the endpoint is closed — a forged "Approved"
 * decision would otherwise create verified helpers.
 */
const verifyWebhookSignature = (
  headers: Record<string, any>,
  rawBody: string,
  parsedPayload?: any,
): void => {
  const secret = config.didit.webhook_secret;

  // Explicit local-testing bypass: only when NODE_ENV is literally "development".
  if (secret === "sandbox_secret" && config.node_env === "development") {
    return;
  }
  if (!secret || secret === "sandbox_secret") {
    logger.error("[DIDIT] webhook rejected: DIDIT_WEBHOOK_SECRET is not configured");
    throw new AppError(StatusCodes.SERVICE_UNAVAILABLE, "Webhook is not configured");
  }

  const sigV2 = headers["x-signature-v2"];
  const sigRaw = headers["x-signature"] || headers["x-didit-signature"] || headers["x-signature-sha256"];
  const signature = sigV2 || sigRaw;

  if (!signature || typeof signature !== "string") {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Missing webhook signature header");
  }

  // 1. Freshness check (mandatory): abs(now - X-Timestamp) <= 300 seconds
  const rawTimestamp = headers["x-timestamp"] || headers["x-request-timestamp"];
  let ts = Number(rawTimestamp);
  if (!rawTimestamp || Number.isNaN(ts)) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Missing webhook timestamp");
  }
  if (ts > 10000000000) {
    ts = Math.floor(ts / 1000); // convert ms to seconds
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > 300) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Webhook timestamp drift exceeds 300 seconds window");
  }

  // 2. Canonicalise (shortenFloats -> sortKeys -> JSON.stringify with unescaped Unicode)
  let expectedSignature: string;
  if (sigV2 && parsedPayload) {
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsedPayload)));
    expectedSignature = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  } else {
    expectedSignature = crypto.createHmac("sha256", secret).update(rawBody || "", "utf8").digest("hex");
  }

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  // 3. Constant-time HMAC comparison
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid webhook HMAC signature");
  }
};

const documentFrom = (decision: any) =>
  decision?.id_verifications?.[0] || decision?.documents?.[0] || decision?.document || decision?.ocr;

/**
 * Evaluates a Didit decision (V3 plural arrays) and updates User & Auth records.
 *
 * "Approved helper" requires ALL of: provider says approved, adult (from the ID's
 * birth date), document not expired, the ID name matches the profile name, the
 * document is not already used by another active helper, and the helper profile
 * is complete. Anything doubtful goes to manual review instead of being approved.
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
  const idDoc = documentFrom(decision);
  const rawDocNumber = idDoc?.document_number || "";
  const firstName = idDoc?.first_name || "";
  const lastName = idDoc?.last_name || "";
  const ocrName = firstName || lastName ? `${firstName} ${lastName}`.trim() : undefined;
  const dateOfBirth: string | undefined = idDoc?.date_of_birth || idDoc?.birth_date;
  const documentExpiry: string | undefined = idDoc?.expiration_date || idDoc?.date_of_expiry;
  const issuingCountry: string | undefined = idDoc?.issuing_state || idDoc?.issuing_country || idDoc?.nationality;

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
      logger.warn(`[SECURITY AUTO-BAN] User ${userId} matched blacklisted doc hash`);

      await AuthRepository.updateById(String(user.auth), {
        isBlacklisted: true,
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
            adminId: user._id,
            reason: `Automatic ban: Scanned identity document matches blacklisted record (${blacklistHit.reason})`,
            previousStatus: user.helperApplicationStatus || "pending",
            newStatus: "rejected",
            timestamp: new Date(),
          },
        },
      });

      await revokeAllSessions(String(user.auth));
      disconnectUserSockets(userId);
      await cacheService.deleteCache(buildCacheKey("user", "me", userId));
      notifyUserT(userId, "kyc.declined", { reason: "Your identity verification was declined. Contact support if you believe this is a mistake." }, {
        type: "kyc_rejected",
        status: "auto_banned",
      }).catch(() => undefined);
      return { status: "auto_banned_blacklisted_document", autoBanned: true };
    }
  }

  // 4. Decision Evaluation
  const statusString = overallStatus || decision?.status || "Declined";
  const providerApproved =
    statusString === "Approved" ||
    (statusString.toLowerCase() === "approved" && (isBiometricMatch || livenessPassed));

  const warnings: string[] = [...(decision?.warnings || [])];
  const nameScore = ocrName && user.name ? nameSimilarity(ocrName, user.name) : undefined;
  const prev = user.diditDiagnostics || {};
  const diagnostics = {
    faceMatchScore: faceMatch ? confidenceScore : (prev.faceMatchScore ?? confidenceScore),
    livenessScore: livenessCheck?.score
      ? Math.round(livenessCheck.score * 100)
      : providerApproved
        ? (prev.livenessScore ?? 100)
        : 0,
    livenessPassed: providerApproved ? true : livenessPassed,
    ocrName,
    dateOfBirth,
    documentExpiry,
    issuingCountry,
    nameMatchScore: nameScore !== undefined ? Math.round(nameScore * 100) : undefined,
    warnings,
  };

  const common = {
    documentNumberHash: documentHash || user.documentNumberHash,
    maskedDocumentNumber: maskedDocumentNumber || user.maskedDocumentNumber,
    diditDiagnostics: diagnostics,
  };

  // Hard declines that apply even if the provider said "Approved".
  let declineReason: string | undefined;
  if (providerApproved) {
    const age = ageFrom(dateOfBirth);
    if (age !== null && age < MIN_HELPER_AGE) {
      declineReason = "Helpers must be at least 18 years old";
    } else if (documentExpiry && new Date(documentExpiry).getTime() < Date.now()) {
      declineReason = "The identity document has expired";
    } else if (
      allowedDocCountries().length &&
      issuingCountry &&
      !allowedDocCountries().includes(String(issuingCountry).toUpperCase())
    ) {
      declineReason = "This identity document is not accepted";
    } else if (documentHash || user.documentNumberHash) {
      const duplicate = await UserRepository.exists({
        documentNumberHash: documentHash || user.documentNumberHash,
        _id: { $ne: user._id },
        isDeleted: false,
        helperApplicationStatus: HelperApplicationStatus.APPROVED,
      });
      if (duplicate) declineReason = "This identity document is already used by another account";
    }
  }

  const finalizeDecline = async (reason: string, status = statusString || "Declined") => {
    // Idempotency: already rejected with the same status
    if (user.helperApplicationStatus === HelperApplicationStatus.REJECTED && user.diditStatus === status) {
      return { status: "rejected", autoBanned: false };
    }
    await UserRepository.updateById(userId, {
      helperApplicationStatus: HelperApplicationStatus.REJECTED,
      diditStatus: status,
      diditDecisionReason: reason,
      rejectionReason: reason,
      appealStatus: user.appealCount >= 3 ? "max_exceeded" : "none",
      ...common,
      $push: {
        applicationHistory: {
          appliedAt: new Date(),
          status: HelperApplicationStatus.REJECTED,
          rejectionReason: reason,
          reviewedAt: new Date(),
        },
      },
    });
    notifyUserT(userId, "kyc.declined", { reason: reason.length > 120 ? `${reason.slice(0, 120)}…` : reason }, {
      type: "kyc_rejected",
      status: "rejected",
    }).catch(() => undefined);
    await cacheService.deleteCache(buildCacheKey("user", "me", userId));
    emitToUser(userId, "kyc:updated", { status: "rejected" });
    return { status: "rejected", autoBanned: false };
  };

  if (providerApproved && declineReason) {
    return finalizeDecline(declineReason, "Declined");
  }

  if (providerApproved) {
    // Name on the ID must resemble the profile name; if not, a human checks it.
    if (nameScore !== undefined && nameScore < 0.5) {
      warnings.push(`Name on the ID ("${ocrName}") does not match the profile name ("${user.name}")`);
      await UserRepository.updateById(userId, {
        helperApplicationStatus: HelperApplicationStatus.PENDING,
        diditStatus: "In Review",
        diditDecisionReason: "The name on the ID differs from the profile name — manual review",
        ...common,
      });
      notifyAdmins("KYC needs manual review", `${user.name}: ID name differs from the profile name.`, {
        type: "kyc_review",
        userId,
      }, "helpers.review").catch(() => undefined);
      notifyUserT(userId, "kyc.in_review", {}, { type: "kyc_pending", status: "in_review" }).catch(() => undefined);
      await cacheService.deleteCache(buildCacheKey("user", "me", userId));
      emitToUser(userId, "kyc:updated", { status: "in_review" });
      return { status: "in_review", autoBanned: false };
    }

    // Identity is fine; approval additionally needs a complete helper profile.
    const missing = profileMissing(user);
    if (!user.isHelperFormSubmitted || missing.length) {
      await UserRepository.updateById(userId, {
        helperApplicationStatus: HelperApplicationStatus.PENDING,
        diditStatus: "Approved",
        diditDecisionReason: `Identity verified — profile incomplete (${missing.join(", ") || "application form"})`,
        ...common,
      });
      notifyUserT(userId, "kyc.profile_incomplete", {}, { type: "kyc_pending", status: "profile_incomplete" }).catch(
        () => undefined,
      );
      await cacheService.deleteCache(buildCacheKey("user", "me", userId));
      emitToUser(userId, "kyc:updated", { status: "profile_incomplete", missing });
      return { status: "profile_incomplete", autoBanned: false };
    }

    // Idempotency: If helper is already approved, skip duplicate notification and updates
    if (
      user.helperApplicationStatus === HelperApplicationStatus.APPROVED &&
      user.diditStatus === "Approved"
    ) {
      logger.info(`[Didit] User ${userId} is already approved. Suppressing duplicate KYC notification.`);
      return { status: "approved", autoBanned: false };
    }

    // Auto-Approve Helper
    await UserRepository.updateById(userId, {
      helperApplicationStatus: HelperApplicationStatus.APPROVED,
      isHelperFormSubmitted: true,
      diditStatus: "Approved",
      diditDecisionReason: "Automated KYC Verification Passed",
      rejectionReason: null,
      ...common,
      $push: {
        applicationHistory: {
          appliedAt: new Date(),
          status: HelperApplicationStatus.APPROVED,
          reviewedAt: new Date(),
        },
      },
    });

    // Promote Auth role to helper (the API reads the role from the database, so it applies immediately)
    await AuthRepository.updateById(String(user.auth), { role: AuthRole.HELPER });

    notifyUserT(userId, "helper.approved", {}, { type: "kyc_approved", status: "approved" }).catch(() => undefined);
    await cacheService.deleteCache(buildCacheKey("user", "me", userId));
    emitToUser(userId, "kyc:updated", { status: "approved" });
    return { status: "approved", autoBanned: false };
  }

  if (statusString === "In Review") {
    // Idempotency: If helper is already marked In Review, skip duplicate notification
    if (user.helperApplicationStatus === HelperApplicationStatus.PENDING && user.diditStatus === "In Review") {
      return { status: "in_review", autoBanned: false };
    }

    await UserRepository.updateById(userId, {
      helperApplicationStatus: HelperApplicationStatus.PENDING,
      diditStatus: "In Review",
      diditDecisionReason: "Identity verification is under manual compliance review",
      ...common,
    });

    notifyUserT(userId, "kyc.in_review", {}, { type: "kyc_pending", status: "in_review" }).catch(() => undefined);
    await cacheService.deleteCache(buildCacheKey("user", "me", userId));
    emitToUser(userId, "kyc:updated", { status: "in_review" });
    return { status: "in_review", autoBanned: false };
  }

  // Declined / Rejected
  const reason =
    decision?.decline_reason ||
    decision?.reason ||
    (!isBiometricMatch ? "Face match score below threshold" : "Liveness or document scan failed");
  return finalizeDecline(reason);
};

/**
 * After the helper finished the application form: if the identity check had
 * already passed earlier (profile was the only thing missing), approve now.
 */
const reevaluateAfterProfile = async (userId: string): Promise<boolean> => {
  const user = await UserRepository.findById(userId);
  if (
    !user ||
    user.helperApplicationStatus !== HelperApplicationStatus.PENDING ||
    String(user.diditStatus || "").toLowerCase() !== "approved" ||
    !user.isHelperFormSubmitted ||
    profileMissing(user).length
  ) {
    return false;
  }
  // Re-run the decision rules with what was stored from the original identity check.
  const d = user.diditDiagnostics || {};
  const result = await processDecisionInternal(
    userId,
    {
      status: "Approved",
      warnings: d.warnings,
      id_verifications: [
        {
          first_name: d.ocrName,
          last_name: "",
          date_of_birth: d.dateOfBirth,
          expiration_date: d.documentExpiry,
          issuing_state: d.issuingCountry,
        },
      ],
    },
    "Approved",
  );
  return result.status === "approved";
};

/**
 * Webhook entry point handling Didit webhook POST requests.
 */
const handleWebhook = async (headers: Record<string, any>, rawBody: string, payload: any) => {
  // 1. Verify HMAC & Timestamp
  verifyWebhookSignature(headers, rawBody, payload);

  // 2. Atomic SET NX idempotency. The key includes the webhook type and status so the
  //    final "Approved/Declined" delivery is never swallowed by an earlier "In Progress" one.
  const eventId = payload.event_id || headers["x-event-id"];
  const dedupId = eventId
    ? String(eventId)
    : [payload.session_id || payload.id, payload.webhook_type, payload.status].filter(Boolean).join(":");
  if (dedupId) {
    const isNew = await redisClient.setNX(`didit:event:${dedupId}`, "1", 86400);
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
    // Never downgrade a finished decision with a late intermediate delivery.
    const current = await UserRepository.findById(String(userId));
    if (current && ["approved", "declined", "rejected"].includes(String(current.diditStatus || "").toLowerCase())) {
      return { status: "ignored_stale_status" };
    }
    await UserRepository.updateById(String(userId), { diditStatus: sessionStatus });
    return { status: "status_updated", sessionStatus };
  }

  return processDecisionInternal(String(userId), payload.decision, payload.status);
};

/**
 * Mobile instant sync API calling Didit decision endpoint directly.
 * Only the caller's OWN session can be synced: the session id must be the one
 * stored for this user AND the provider must report this user as its vendor_data.
 */
const syncSession = async (userId: string, sessionId: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  if (!sessionId || user.diditSessionId !== sessionId) {
    throw new AppError(StatusCodes.FORBIDDEN, "This verification session does not belong to you", {
      code: "SESSION_NOT_OWNED",
    });
  }

  // Prevent concurrent duplicate sync calls across callback, deep link, and app resume
  const syncLockKey = `didit:sync_lock:${sessionId}`;
  const lockAcquired = await redisClient.setNX(syncLockKey, "1", 10);
  if (!lockAcquired) {
    logger.info(`[Didit] Concurrent syncSession suppressed for session ${sessionId}`);
    return {
      status:
        user.helperApplicationStatus === HelperApplicationStatus.APPROVED
          ? "approved"
          : user.diditStatus?.toLowerCase() || "in_progress",
      autoBanned: false,
    };
  }

  try {
    const response = await fetch(`${DIDIT_BASE_URL}/session/${encodeURIComponent(sessionId)}/decision/`, {
      method: "GET",
      headers: {
        "x-api-key": config.didit.api_key,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[DIDIT] fetch decision failed (${response.status}): ${errText.slice(0, 300)}`);
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        "The identity verification service is unavailable right now. Please try again later.",
        { code: "KYC_PROVIDER_ERROR" },
      );
    }

    const decision = (await response.json()) as any;

    const vendor = decision?.vendor_data ?? decision?.session?.vendor_data;
    if (vendor && String(vendor) !== String(userId)) {
      logger.warn(`[DIDIT] sync blocked: session ${sessionId} belongs to another user`);
      throw new AppError(StatusCodes.FORBIDDEN, "This verification session does not belong to you", {
        code: "SESSION_NOT_OWNED",
      });
    }

    return await processDecisionInternal(userId, decision, decision.status);
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    logger.error(`[DIDIT] sync failed: ${error?.message || error}`);
    throw new AppError(
      StatusCodes.BAD_GATEWAY,
      "The identity verification service is unavailable right now. Please try again later.",
      { code: "KYC_PROVIDER_ERROR" },
    );
  }
};

export const DiditService = {
  createSession,
  handleWebhook,
  syncSession,
  verifyWebhookSignature,
  reevaluateAfterProfile,
};
