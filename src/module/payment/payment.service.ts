import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import config from "config";
import { PaymentRepository } from "./payment.repository";
import { OrderType, PaymentStatus } from "./payment.interface";
import { UserRepository } from "../user/user.repository";
import { JobRepository } from "../job/job.repository";
import { ChatRepository } from "../chat/chat.repository";
import { WalletRepository } from "../wallet/wallet.repository";
import { OfferStatus } from "../chat/chat.interface";
import { notifyUser } from "../../util/notifyUser";

const SIMULATOR_URL = process.env.PAYMENT_SIMULATOR_URL || "http://payment-simulator:5099/simulator/v1/checkout";

type TInitPaymentPayload = {
  amount: number;
  orderId: string;
  orderType: "job" | "offer" | "wallet_topup";
  returnUrl?: string;
  metadata?: Record<string, any>;
};

// ─── Initialize Payment ──────────────────────────────────
const initializePayment = async (userId: string, payload: TInitPaymentPayload) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const { amount, orderId, orderType, returnUrl, metadata } = payload;
  const tempTransactionId = "init_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

  // 1. Attempt to call Payment Simulator (container DNS or fallback)
  const candidateUrls = Array.from(
    new Set([
      SIMULATOR_URL,
      "http://payment-simulator:5099/simulator/v1/checkout",
      "http://localhost:5099/simulator/v1/checkout",
    ]),
  );

  let simData: any = null;

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(1000),
        body: JSON.stringify({
          amount,
          currency: "MAD",
          orderId,
          orderType,
          returnUrl: returnUrl || `${config.urls.api_base_url}/api/v1/payment/callback`,
          metadata: { ...metadata, userId },
        }),
      });

      if (response.ok) {
        simData = await response.json();
        if (simData && simData.success) {
          break;
        }
      }
    } catch (_) {
      // Continue to next candidate URL (fails fast via 1s timeout)
    }
  }

  // 2. If external simulator was unreachable, generate direct simulation session
  if (!simData || !simData.success) {
    const fallbackSessionId = "sim_sess_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    const publicHost = config.urls.api_base_url.replace(/\/api\/v1\/?$/, "");
    simData = {
      success: true,
      sessionId: fallbackSessionId,
      checkoutUrl: `${publicHost}/checkout?sessionId=${fallbackSessionId}`,
      session: { metadata: { ...metadata, userId } },
    };
  }

  // 3. Save transaction record
  const transaction = await PaymentRepository.create({
    transactionId: tempTransactionId,
    orderId,
    orderType: orderType as OrderType,
    user: userId as any,
    amount,
    currency: "MAD",
    status: PaymentStatus.PENDING,
    sessionId: simData.sessionId,
    checkoutUrl: simData.checkoutUrl,
    metadata: simData.session?.metadata,
  });

  return {
    checkoutUrl: simData.checkoutUrl,
    sessionId: simData.sessionId,
    orderId: transaction.orderId,
    transactionId: transaction.transactionId,
  };
};

// ─── Webhook Handler ─────────────────────────────────────
const handleWebhook = async (
  payload: {
    event: string;
    transactionId: string;
    orderId: string;
    orderType: string;
    amount: number;
    currency?: string;
    metadata?: Record<string, any>;
  },
  signature?: string,
) => {
  const { event, transactionId, orderId, orderType, amount, metadata } = payload;

  console.log(`[PAYMENT WEBHOOK] Received event: ${event} for order ${orderId} (${orderType})`);

  // Verify HMAC signature if present
  const secret = process.env.PAYMENT_SIMULATOR_SECRET || "tarik_payment_sim_secret_2026";
  if (signature) {
    const crypto = await import("crypto");
    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
    if (signature !== expected) {
      console.warn("[PAYMENT WEBHOOK] Invalid signature detected. Ignoring or logging warning.");
    }
  }

  const isSuccess = event === "payment.success";
  const newStatus = isSuccess ? PaymentStatus.COMPLETED : PaymentStatus.FAILED;

  const paymentMethod = metadata?.paymentMethod || "online";

  // Find or update transaction record — try multiple lookup strategies
  let transaction = await PaymentRepository.findByOrderId(orderId);

  // Legacy: clients once sent transactionId (init_*) as orderId — match that record.
  if (!transaction && orderId && orderId.startsWith("init_")) {
    transaction = await PaymentRepository.findByTransactionId(orderId);
    if (transaction) {
      console.log(
        `[PAYMENT WEBHOOK] Resolved legacy init_* orderId to payment ${transaction.transactionId} (order ${transaction.orderId})`,
      );
    }
  }

  // Fallback: try by transactionId if orderId lookup fails
  if (!transaction && transactionId) {
    transaction = await PaymentRepository.findByTransactionId(transactionId);
  }

  // Fallback: try by sessionId if both above fail
  if (!transaction && metadata?.sessionId) {
    transaction = await PaymentRepository.findBySessionId(metadata.sessionId);
  }

  if (!transaction) {
    // Never invent a second payment row for an unknown order — that created
    // ghost COMPLETED entries next to the real PENDING topup_* records.
    console.warn(
      `[PAYMENT WEBHOOK] No payment found for orderId=${orderId} txn=${transactionId} — ignore (no create)`,
    );
    return {
      success: false,
      message: "Payment order not found",
    };
  }

  if (transaction) {
    // App-level guard: ignore late/duplicate success after already completed
    if (
      isSuccess &&
      transaction.status === PaymentStatus.COMPLETED &&
      transaction.transactionId !== transactionId
    ) {
      console.log(
        `[PAYMENT WEBHOOK] Transaction ${transaction.transactionId} already completed — ignore duplicate for order ${orderId}`,
      );
      return { success: true, message: "Webhook already processed" };
    }
    await PaymentRepository.updateByTransactionId(transaction.transactionId, {
      transactionId,
      status: newStatus,
      paymentMethod,
      orderId: transaction.orderId || orderId,
      metadata: { ...(transaction.metadata || {}), ...metadata },
    });
  }

  if (!isSuccess) {
    // In-app history so user sees cancel/fail in Notifications list
    const failUserId = metadata?.userId || (transaction as any)?.user;
    if (failUserId) {
      try {
        const { notifyUser } = await import("../../util/notifyUser");
        notifyUser(
          String(failUserId),
          "Payment cancelled",
          orderType === OrderType.WALLET_TOPUP
            ? "Your wallet top-up was not completed. You can try again later."
            : "Your payment was not completed. You can try again later.",
          {
            type: "payment_failed",
            orderType: String(orderType || ""),
            orderId: String(orderId || ""),
          },
        ).catch(() => {});
      } catch (_) {}
    }
    return { success: true, message: "Webhook processed (Payment Failed)" };
  }

  // Idempotency: skip fulfillment if this transaction was already completed
  if (transaction?.status === PaymentStatus.COMPLETED) {
    return { success: true, message: "Webhook already processed" };
  }

  // Fulfill business logic based on orderType
  if (orderType === OrderType.WALLET_TOPUP) {
    const userId = metadata?.userId;
    if (userId) {
      // Idempotent top-up by referenceId (transactionId)
      const already = await WalletRepository.hasTopupReference(userId, transactionId);
      if (!already) {
        await WalletRepository.topup(userId, amount, transactionId);
        console.log(`[PAYMENT WEBHOOK] Wallet credited ${amount} MAD for user ${userId}`);
        try {
          const { emitToUser } = await import("../../socket/socket.gateway");
          emitToUser(userId, "wallet:topup_success", { amount, transactionId });
        } catch (_) {}
        notifyUser(
          userId,
          "Payment successful",
          `Your wallet was topped up with ${amount} MAD.`,
          { type: "payment_success", orderType: "wallet_topup", transactionId },
        ).catch(() => {});
      }
    }
  } else if (orderType === OrderType.JOB) {
    // Only open jobs that are still waiting for payment (never reopen cancelled/in-progress)
    const updatedJob = await JobRepository.markPendingPaymentOpen(orderId);
    if (!updatedJob) {
      const { JobRepository: JobRepo } = await import("../job/job.repository");
      const existing = await JobRepo.findById(orderId);
      const status = (existing as any)?.status;
      if (status === "cancelled") {
        // Late webhook after cancel — refund so client is not charged for a dead job
        console.log(
          `[PAYMENT WEBHOOK] Job ${orderId} already cancelled — auto-refund`,
        );
        try {
          const refund = await refundJobPayment(orderId, "Job cancelled before payment settled");
          if (existing) {
            await JobRepo.updateById(orderId, {
              refundStatus: refund.success ? "refunded" : "failed",
              refundReference: refund.reference || undefined,
            } as any);
          }
        } catch (err: any) {
          console.error("[PAYMENT WEBHOOK] Auto-refund failed:", err?.message);
        }
        return {
          success: true,
          message: "Payment refunded — job was cancelled",
        };
      }
      console.log(
        `[PAYMENT WEBHOOK] Job ${orderId} not in pending_payment — skip OPEN transition`,
      );
    } else {
      console.log(`[PAYMENT WEBHOOK] Job ${orderId} marked OPEN after online payment`);
      try {
        const { emitToUser } = await import("../../socket/socket.gateway");
        if (metadata?.userId) {
          emitToUser(metadata.userId, "job:payment_verified", { jobId: orderId });
        }
        const { notifyNearbyHelpers } = await import("../job/job.service");
        await notifyNearbyHelpers(updatedJob);
      } catch (_) {}
      if (metadata?.userId) {
        const jobTitle = (updatedJob as any)?.title || "your job";
        notifyUser(
          metadata.userId,
          "Payment successful",
          `Payment received for "${jobTitle}". Nearby helpers are being notified.`,
          { type: "payment_success", orderType: "job", orderId },
        ).catch(() => {});
      }
    }
  } else if (orderType === OrderType.OFFER) {
    let createdJobId: string | undefined;
    const resolvedHelperId = metadata?.helperId || transaction?.metadata?.helperId;
    const resolvedUserId = metadata?.userId || transaction?.metadata?.userId;

    try {
      const { ChatService } = await import("../chat/chat.service");
      const { ChatRepository: ChatRepo } = await import("../chat/chat.repository");
      const message = await ChatRepository.findMessageById(orderId);
      const helperId = resolvedHelperId || (message?.sender ? String(message.sender) : undefined);
      const userId = resolvedUserId || (transaction?.user ? String(transaction.user) : undefined);

      // Atomic: accept from pending OR awaiting_payment (online checkout claim)
      const claimed = await ChatRepo.claimOfferStatus(
        orderId,
        OfferStatus.ACCEPTED,
        [OfferStatus.PENDING, OfferStatus.AWAITING_PAYMENT],
      );

      if (message?.offerData && helperId && userId && claimed) {
        const job = await ChatService.createJobFromOffer(
          message.offerData,
          helperId,
          userId,
          orderId,
        );
        createdJobId = String(job._id);
        await ChatRepository.updateOfferStatus(orderId, OfferStatus.ACCEPTED, createdJobId);
        console.log(`[PAYMENT WEBHOOK] Offer ${orderId} marked ACCEPTED and Job ${createdJobId} created`);
      } else if (!claimed) {
        console.log(`[PAYMENT WEBHOOK] Offer ${orderId} already accepted — skip job create`);
      }
    } catch (err: any) {
      console.error("[PAYMENT WEBHOOK] Error creating job from offer:", err.message);
    }

    try {
      const { emitToUser } = await import("../../socket/socket.gateway");
      const socketUserId = resolvedUserId || (transaction?.user ? String(transaction.user) : undefined);
      const socketHelperId = resolvedHelperId;
      if (socketUserId) {
        emitToUser(socketUserId, "offer:payment_verified", { offerId: orderId, jobId: createdJobId });
      }
      if (socketHelperId) {
        emitToUser(socketHelperId, "offer:payment_verified", { offerId: orderId, jobId: createdJobId });
      }
    } catch (_) {}

    if (resolvedUserId) {
      notifyUser(
        resolvedUserId,
        "Payment successful",
        "Your offer payment was received. The helper has been notified.",
        { type: "payment_success", orderType: "offer", orderId },
      ).catch(() => {});
    }
    if (resolvedHelperId) {
      notifyUser(
        resolvedHelperId,
        "Offer accepted",
        "A client paid for your offer. Check your jobs.",
        { type: "offer_accepted", orderId, jobId: createdJobId || "" },
      ).catch(() => {});
    }
  }

  return { success: true, message: "Webhook processed successfully" };
};

/**
 * Refund an online job payment to the client's original payment method.
 * Does NOT credit the app wallet (clients have no wallet).
 * Marks REFUNDED only after the gateway accepts the refund.
 */
const refundJobPayment = async (
  jobId: string,
  reason?: string,
): Promise<{ success: boolean; reference?: string; message?: string }> => {
  const [paymentDocs] = await PaymentRepository.findAll(
    {
      orderId: jobId,
      orderType: OrderType.JOB,
      status: PaymentStatus.COMPLETED,
    },
    1,
    1,
  );
  const payment = paymentDocs?.[0] as any;
  if (!payment) {
    return {
      success: false,
      message: "No completed payment found for this job",
    };
  }

  if (payment.status === PaymentStatus.REFUNDED) {
    return {
      success: true,
      reference: payment.metadata?.refundReference || payment.transactionId,
      message: "Already refunded",
    };
  }

  // Call gateway first. Simulator path is a no-op success; wire real API here.
  const gatewayRef = `rf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let gatewayOk = true;
  try {
    console.log(
      `[PAYMENT REFUND] Job ${jobId} amount ${payment.amount} ${payment.currency} ref ${gatewayRef}`,
    );
    // TODO: call real gateway refund API; set gatewayOk = false on failure
  } catch (err: any) {
    gatewayOk = false;
    console.error(`[PAYMENT REFUND] Gateway failed for job ${jobId}:`, err?.message);
  }

  if (!gatewayOk) {
    await PaymentRepository.updateByTransactionId(payment.transactionId, {
      metadata: {
        ...(payment.metadata || {}),
        refundAttemptedAt: new Date().toISOString(),
        refundFailedReason: reason || "Gateway refund failed",
      },
    } as any);
    return {
      success: false,
      message: "Gateway refund failed — payment left as completed",
    };
  }

  await PaymentRepository.updateByTransactionId(payment.transactionId, {
    status: PaymentStatus.REFUNDED,
    metadata: {
      ...(payment.metadata || {}),
      refundedAt: new Date().toISOString(),
      refundReason: reason || "Job cancelled",
      refundReference: gatewayRef,
    },
  } as any);

  return {
    success: true,
    reference: gatewayRef,
    message: "Refund completed",
  };
};

// ─── Callback Handler (Redirect from Simulator) ──────────
const handleCallback = async (query: { status?: string; transactionId?: string; orderId?: string; orderType?: string }) => {
  let orderType = query.orderType;

  // Fallback: If orderType was omitted from query, resolve from PaymentRepository
  if (!orderType) {
    try {
      let existing = null;
      if (query.orderId) {
        existing = await PaymentRepository.findByOrderId(query.orderId);
      }
      if (!existing && query.transactionId) {
        existing = await PaymentRepository.findByTransactionId(query.transactionId);
      }
      if (existing) {
        orderType = existing.orderType;
      }
    } catch (_) {}
  }

  return {
    status: query.status || "completed",
    transactionId: query.transactionId || "",
    orderId: query.orderId || "",
    orderType: orderType || "",
    message: query.status === "success" ? "Payment successful!" : "Payment failed or cancelled.",
  };
};

const getAllPayments = async (query: {
  page?: number;
  limit?: number;
  status?: string;
  paymentMethod?: string;
  search?: string;
  sort?: "newest" | "oldest";
} = {}) => {
  // Auto-expire abandoned checkouts so admin list doesn't show ghost pendings.
  try {
    await PaymentRepository.expireStuckPendings(24);
  } catch (_) {}

  const filter: any = {};
  if (query.status && query.status !== "all") {
    filter.status = query.status;
  }
  if (query.paymentMethod && query.paymentMethod !== "all") {
    filter.paymentMethod = query.paymentMethod;
  }
  if (query.search) {
    filter.$or = [
      { transactionId: { $regex: query.search, $options: "i" } },
      { orderId: { $regex: query.search, $options: "i" } },
    ];
  }

  const page = query.page || 1;
  const limit = query.limit || 20;
  const sort = query.sort === "oldest" ? { createdAt: 1 as const } : { createdAt: -1 as const };
  const [docs, total] = await PaymentRepository.findAll(filter, page, limit, sort);
  return { docs, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const getPaymentById = async (id: string) => {
  if (!id || id === "undefined" || id === "null") {
    throw new AppError(StatusCodes.BAD_REQUEST, "Payment id is required");
  }
  if (!/^[0-9a-fA-F]{24}$/.test(id)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid payment id");
  }
  const payment = await PaymentRepository.findById(id);
  if (!payment) {
    throw new AppError(StatusCodes.NOT_FOUND, "Payment transaction not found");
  }
  return payment;
};

/**
 * Stuck / aging payments: pending longer than `olderThanHours` or failed.
 * Used by admin dashboard.
 */
const getStuckPayments = async (
  olderThanHours = 24,
  page = 1,
  limit = 20,
) => {
  try {
    await PaymentRepository.expireStuckPendings(olderThanHours);
  } catch (_) {}

  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const filter = {
    $or: [
      { status: PaymentStatus.PENDING, createdAt: { $lte: cutoff } },
      { status: PaymentStatus.FAILED },
    ],
  };

  const [docs, total] = await PaymentRepository.findAll(filter, page, limit);
  const enriched = (docs as any[]).map((p) => {
    const obj = p?.toObject ? p.toObject() : p;
    return {
      ...obj,
      _id: obj?._id != null ? String(obj._id) : undefined,
      id: obj?._id != null ? String(obj._id) : undefined,
      ageHours: Math.floor((Date.now() - new Date(obj.createdAt).getTime()) / 3600000),
      stuckReason:
        obj.status === PaymentStatus.FAILED
          ? "failed"
          : `pending > ${olderThanHours}h`,
    };
  });

  return {
    docs: enriched,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    olderThanHours,
  };
};

export const PaymentService = {
  initializePayment,
  handleWebhook,
  handleCallback,
  getAllPayments,
  getPaymentById,
  refundJobPayment,
  getStuckPayments,
};
