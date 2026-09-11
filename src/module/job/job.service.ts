import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { Types } from "mongoose";
import { JobRepository } from "./job.repository";
import { UserRepository } from "../user/user.repository";
import { CategoryRepository } from "../category/category.repository";
import { JobStatus, PaymentMethod } from "./job.interface";
import { emitToUser } from "../../socket/socket.gateway";
import { sendFCMMulticast } from "../../util/firebase";
import { notifyUser } from "../../util/notifyUser";
import { NotificationRepository } from "../notification/notification.repository";
import { NotificationAudience } from "../notification/notification.interface";
import { logger } from "../../logger/logger";

type TCreateJobPayload = {
  title: string;
  description?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  budget: number;
  budgetType?: "hourly" | "fixed";
  paymentMethod?: "online" | "cash";
  address?: string;
  longitude?: number;
  latitude?: number;
  images?: string[];
  category: string;
};

type TUpdateJobPayload = Partial<TCreateJobPayload> & { status?: string };

// ─── Notify Nearby Helpers ──────────────────────────────
export const notifyNearbyHelpers = async (job: any) => {
  try {
    if (!job || !job.location || !job.location.coordinates) return;
    const [lon, lat] = job.location.coordinates;

    const filter: any = {
      helperApplicationStatus: "approved",
      isBlocked: false,
      isDeleted: false,
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lon, lat] },
          $maxDistance: 30000,
        },
      },
    };

    if (job.category) {
      filter.$or = [
        { serviceType: job.category },
        { serviceType: { $exists: false } },
        { serviceType: null },
      ];
    }

    const nearbyHelpers = await UserRepository.findMany(filter, { limit: 50 });
    const jobData = job.toObject ? job.toObject() : job;

    const tokens: string[] = [];
    const title = "New Job Nearby";
    const body = `New job available: ${job.title} (${job.budget} MAD)`;
    const data = { jobId: String(job._id), type: "new_job" };

    for (const helper of nearbyHelpers) {
      if (String(helper._id) === String(job.postedBy)) continue;
      emitToUser(String(helper._id), "job:new_nearby", jobData);
      // In-app history (works even without FCM token)
      NotificationRepository.create({
        user: String(helper._id),
        audience: NotificationAudience.USER,
        title,
        body,
        data,
      }).catch(() => {});
      if (helper.deviceToken) tokens.push(helper.deviceToken);
    }

    if (tokens.length) {
      const { invalidTokens } = await sendFCMMulticast(tokens, title, body, data);
      for (const dead of invalidTokens) {
        await UserRepository.clearDeviceTokenByValue(dead);
      }
    }
  } catch (err) {
    logger.error("Failed to notify nearby helpers", err);
  }
};

// ─── Create Job ─────────────────────────────────────────
const createJob = async (userId: string, payload: TCreateJobPayload) => {
  // Validate category exists
  const category = await CategoryRepository.findById(payload.category);
  if (!category) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Category not found");
  }

  // Validate user exists
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const isOnline = payload.paymentMethod === "online";

  let minBudget = 0;
  try {
    const { SettingsService } = await import("../settings/settings.service");
    const settings = await SettingsService.getSettings();
    if (settings?.minimumServiceAmount != null) {
      minBudget = Number(settings.minimumServiceAmount) || 0;
    }
  } catch (_) {}
  if (minBudget > 0 && payload.budget < minBudget) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Minimum job budget is ${minBudget} MAD`,
    );
  }

  const jobData: any = {
    title: payload.title,
    description: payload.description,
    budget: payload.budget,
    budgetType: payload.budgetType || "fixed",
    paymentMethod: payload.paymentMethod || "cash",
    status: isOnline ? JobStatus.PENDING_PAYMENT : JobStatus.OPEN,
    postedBy: userId,
    category: payload.category,
    images: payload.images || [],
  };

  if (payload.date) {
    jobData.date = new Date(payload.date);
  }
  if (payload.startTime) {
    jobData.startTime = payload.startTime;
  }
  if (payload.endTime) {
    jobData.endTime = payload.endTime;
  }
  if (payload.address) {
    jobData.address = payload.address;
  }
  if (payload.longitude != null && payload.latitude != null) {
    jobData.location = {
      type: "Point",
      coordinates: [payload.longitude, payload.latitude],
    };
  }

  const job = await JobRepository.create(jobData);

  JobRepository.appendHistory(job._id, {
    action: "created",
    by: userId,
    byRole: "client",
  }).catch(() => {});

  if (isOnline) {
    const { PaymentService } = await import("../payment/payment.service");
    const paymentSession = await PaymentService.initializePayment(userId, {
      amount: payload.budget,
      orderId: String(job._id),
      orderType: "job",
      metadata: { userId, jobId: String(job._id) },
    });

    return {
      ...(job.toObject ? job.toObject() : job),
      checkoutUrl: paymentSession.checkoutUrl,
      sessionId: paymentSession.sessionId,
    };
  }

  try {
    emitToUser(userId, "job:posted", job);
    await notifyNearbyHelpers(job);
  } catch (_) {}
  return job;
};

// ─── Get Jobs (paginated, optional filters) ─────────────
const getJobs = async (query: {
  category?: string;
  status?: string;
  paymentMethod?: string;
  search?: string;
  assignedTo?: string;
  postedBy?: string;
  page?: number;
  limit?: number;
}) => {
  const filter: any = {};

  if (query.status && query.status !== "all") {
    filter.status = query.status;
  } else if (!query.status && !query.assignedTo && !query.postedBy && !query.search) {
    filter.status = JobStatus.OPEN;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.paymentMethod && query.paymentMethod !== "all") {
    filter.paymentMethod = query.paymentMethod;
  }

  if (query.assignedTo) {
    filter.assignedTo = query.assignedTo;
  }

  if (query.postedBy) {
    filter.postedBy = query.postedBy;
  }

  if (query.search) {
    filter.$or = [
      { title: { $regex: query.search, $options: "i" } },
      { description: { $regex: query.search, $options: "i" } },
    ];
  }

  return JobRepository.findAll(filter, {
    page: query.page || 1,
    limit: query.limit || 20,
  });
};

// ─── Get Nearby Jobs ────────────────────────────────────
const getNearbyJobs = async (
  userId: string,
  maxDistance?: number,
  category?: string,
) => {
  const user = await UserRepository.findById(userId);
  if (!user || !user.location || !user.location.coordinates) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Please set your location first",
    );
  }

  const [lon, lat] = user.location.coordinates;
  const filter: any = { status: JobStatus.OPEN };
  if (category) {
    filter.category = category;
  }

  const effectiveRadius =
    maxDistance || (user.serviceRadius ? user.serviceRadius * 1000 : 15000);

  return JobRepository.findNearby(lon, lat, effectiveRadius, filter);
};

// ─── Get Job by ID ──────────────────────────────────────
const getJobById = async (jobId: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }
  return job;
};

// ─── Update Job ─────────────────────────────────────────
const updateJob = async (
  userId: string,
  jobId: string,
  payload: TUpdateJobPayload,
) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  // Only owner can update
  if (String(job.postedBy) !== String(userId)) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You can only update your own jobs",
    );
  }

  const updateData: any = {};
  if (payload.title) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.date) updateData.date = new Date(payload.date);
  if (payload.startTime) updateData.startTime = payload.startTime;
  if (payload.endTime) updateData.endTime = payload.endTime;
  if (payload.budget) updateData.budget = payload.budget;
  if (payload.budgetType) updateData.budgetType = payload.budgetType;
  if (payload.paymentMethod) updateData.paymentMethod = payload.paymentMethod;
  if (payload.address !== undefined) updateData.address = payload.address;
  if (payload.images) updateData.images = payload.images;
  if (payload.category) updateData.category = payload.category;
  // Status transitions only via accept/complete/cancel — never via PATCH
  if (payload.longitude != null && payload.latitude != null) {
    updateData.location = {
      type: "Point",
      coordinates: [payload.longitude, payload.latitude],
    };
  }

  const updated = await JobRepository.updateById(jobId, updateData);
  return updated;
};

// ─── Accept Job ─────────────────────────────────────────
const acceptJob = async (helperId: string, jobId: string) => {
  const helper = await UserRepository.findById(helperId, { populate: "auth" });
  if (!helper) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // Role lives on Auth. Always require approved helper application.
  if (helper.helperApplicationStatus !== "approved") {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Your helper account is not approved to accept jobs",
    );
  }
  if (helper.isBlocked || (helper.auth as any)?.isBlacklisted) {
    throw new AppError(StatusCodes.FORBIDDEN, "Account is not allowed to accept jobs");
  }

  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  if (job.status !== JobStatus.OPEN) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This job is no longer open for acceptance",
    );
  }

  if (String(job.postedBy?._id || job.postedBy) === String(helperId)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "You cannot accept your own job post",
    );
  }

  // Deduct platform commission for cash jobs (dynamic from settings, default 20%)
  let commission = 0;
  if (job.paymentMethod === "cash") {
    let feePct = 20;
    try {
      const { SettingsService } = await import("../settings/settings.service");
      const settings = await SettingsService.getSettings();
      if (settings?.platformFeePercentage != null) {
        feePct = settings.platformFeePercentage;
      }
    } catch (_) {}
    commission = Math.round(job.budget * (feePct / 100));
    try {
      const { WalletRepository } = await import("../wallet/wallet.repository");
      await WalletRepository.deductCommission(helperId, commission, jobId);
    } catch (err: any) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        err.message || "Failed to deduct commission from recharge wallet",
      );
    }
  }

  // Atomic claim — only one helper wins OPEN → IN_PROGRESS
  const updatedJob = await JobRepository.claimOpenJob(
    jobId,
    helperId,
    commission,
  );

  if (!updatedJob) {
    // Someone else claimed it — refund commission we just deducted
    if (commission > 0) {
      try {
        const { WalletRepository } = await import("../wallet/wallet.repository");
        await WalletRepository.refundCommission(helperId, commission, jobId);
      } catch (_) {}
    }
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This job is no longer open for acceptance",
    );
  }

  try {
    const ownerId = String(job.postedBy?._id || job.postedBy);
    if (ownerId) emitToUser(ownerId, "job:accepted", updatedJob);
  } catch (_) {}

  const ownerId = String(job.postedBy?._id || job.postedBy);
  if (ownerId) {
    notifyUser(
      ownerId,
      "Job accepted",
      `A helper accepted "${job.title}".`,
      { type: "job_accepted", jobId: String(job._id) },
    ).catch(() => {});
  }

  JobRepository.appendHistory(jobId, {
    action: "accepted",
    by: helperId,
    byRole: "helper",
    note: commission > 0 ? `Commission ${commission} MAD` : undefined,
  }).catch(() => {});

  return updatedJob;
};

// ─── Get Client's Bookings ──────────────────────────────
const attachMyReviews = async (jobs: any[], userId: string) => {
  const { ReviewRepository } = await import("../review/review.repository");
  const uid = String(userId);
  const jobIds = jobs
    .map((j) => String(j._id ?? j.id ?? ""))
    .filter(Boolean);
  if (!jobIds.length) return jobs;

  const reviews = await ReviewRepository.findByJobsForUser(uid, jobIds);
  const myByJob = new Map<string, any>();
  const otherByJob = new Map<string, any>();
  for (const r of reviews as any[]) {
    const jid = String(r.job);
    if (String(r.reviewer) === uid) {
      myByJob.set(jid, r);
    } else if (String(r.reviewee) === uid) {
      otherByJob.set(jid, r);
    }
  }

  const shape = (r: any) => ({
    _id: String(r._id),
    rating: r.rating,
    comment: r.comment ?? "",
    createdAt: r.createdAt,
  });

  return jobs.map((job) => {
    const id = String(job._id ?? job.id ?? "");
    const mine = myByJob.get(id);
    const other = otherByJob.get(id);
    return {
      ...job,
      hasMyReview: !!mine,
      myReview: mine ? shape(mine) : null,
      hasReviewFromOther: !!other,
      reviewFromOther: other ? shape(other) : null,
    };
  });
};

const getMyBookings = async (userId: string) => {
  const populateFields = "postedBy,assignedTo,category";
  const allUserJobs = await JobRepository.findMany(
    { postedBy: new Types.ObjectId(userId) },
    { sort: { createdAt: -1 }, populate: populateFields }
  );

  const active: any[] = [];
  const completedRaw: any[] = [];
  const cancelled: any[] = [];
  const unpaid: any[] = [];

  for (const job of allUserJobs) {
    if (job.status === JobStatus.COMPLETED) {
      completedRaw.push(job);
    } else if (job.status === JobStatus.CANCELLED) {
      cancelled.push(job);
    } else if (job.status === JobStatus.PENDING_PAYMENT) {
      unpaid.push(job);
    } else {
      active.push(job);
    }
  }

  const completed = await attachMyReviews(completedRaw, userId);

  return { active, completed, cancelled, unpaid };
};

// ─── Get Helper's Assigned Jobs ─────────────────────────
const getMyAssignedJobs = async (helperId: string) => {
  const populateFields = "postedBy,assignedTo,category";
  const allAssignedJobs = await JobRepository.findMany(
    { assignedTo: new Types.ObjectId(helperId) },
    { sort: { createdAt: -1 }, populate: populateFields }
  );

  const active: any[] = [];
  const completedRaw: any[] = [];
  const cancelled: any[] = [];

  for (const job of allAssignedJobs) {
    if (job.status === JobStatus.COMPLETED) {
      completedRaw.push(job);
    } else if (job.status === JobStatus.CANCELLED) {
      cancelled.push(job);
    } else if (job.status === JobStatus.IN_PROGRESS) {
      active.push(job);
    }
  }

  const completed = await attachMyReviews(completedRaw, helperId);

  return { active, completed, cancelled };
};

// ─── Complete Job ───────────────────────────────────────
const completeJob = async (
  userId: string,
  jobId: string,
  _note?: string,
  isAdmin = false
) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  const isOwner = String(job.postedBy?._id || job.postedBy) === String(userId);

  // Client (owner) or admin only — helpers confirm cash received separately
  if (!isAdmin && !isOwner) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Only the client can mark this job as completed"
    );
  }

  if (job.status !== JobStatus.IN_PROGRESS) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Cannot complete a job with status ${job.status}`,
    );
  }

  // Atomic IN_PROGRESS → COMPLETED (only one winner)
  const updatedJob = await JobRepository.transitionInProgressToCompleted(jobId);
  if (!updatedJob) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Job is no longer in progress",
    );
  }

  // If online payment: release net earnings to helper's wallet once
  if (job.paymentMethod === "online" && job.assignedTo) {
    const credited = await JobRepository.markEscrowCredited(jobId);
    if (credited) {
      let feePct = 20;
      try {
        const { SettingsService } = await import("../settings/settings.service");
        const settings = await SettingsService.getSettings();
        if (settings?.platformFeePercentage != null) {
          feePct = settings.platformFeePercentage;
        }
      } catch (_) {}
      const netMultiplier = Math.max(0, 1 - feePct / 100);
      const netHelperAmount = Math.round(job.budget * netMultiplier);
      try {
        const { WalletRepository } = await import("../wallet/wallet.repository");
        await WalletRepository.creditEarning(
          String(job.assignedTo?._id || job.assignedTo),
          netHelperAmount,
          `escrow_${String(job._id)}`,
          `Job payout for "${job.title}" (+${netHelperAmount} MAD)`,
        );
      } catch (err: any) {
        console.error("[JOB] Failed to release escrow to helper wallet:", err.message);
      }
    }
  }

  try {
    const ownerId = String(job.postedBy?._id || job.postedBy);
    const helperId = job.assignedTo ? String(job.assignedTo?._id || job.assignedTo) : null;
    if (ownerId) emitToUser(ownerId, "job:completed", updatedJob);
    if (helperId) emitToUser(helperId, "job:completed", updatedJob);
  } catch (_) {}

  const completeOwnerId = String(job.postedBy?._id || job.postedBy);
  const completeHelperId = job.assignedTo
    ? String(job.assignedTo?._id || job.assignedTo)
    : null;

  if (completeOwnerId && completeOwnerId !== String(userId)) {
    notifyUser(
      completeOwnerId,
      "Job completed",
      `"${job.title}" was marked completed.`,
      { type: "job_completed", jobId: String(job._id) },
    ).catch(() => {});
  }
  if (completeHelperId && completeHelperId !== String(userId)) {
    notifyUser(
      completeHelperId,
      "Job completed",
      `"${job.title}" was marked completed. Check your earnings.`,
      { type: "job_completed", jobId: String(job._id) },
    ).catch(() => {});
  }

  JobRepository.appendHistory(jobId, {
    action: "completed",
    by: userId,
    byRole: isAdmin ? "admin" : "client",
    note: _note || undefined,
  }).catch(() => {});

  return updatedJob;
};

// ─── Cash received (helper only, after client completes) ─
const confirmCashReceived = async (userId: string, jobId: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  const isAssigned = String(job.assignedTo?._id || job.assignedTo) === String(userId);
  if (!isAssigned) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Only the assigned helper can confirm cash payment"
    );
  }

  if (job.paymentMethod !== PaymentMethod.CASH) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Cash confirmation only applies to cash jobs"
    );
  }

  if (job.status !== JobStatus.COMPLETED) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Client must complete the job before cash can be confirmed"
    );
  }

  if (String(job.paymentStatus || "") === "paid") {
    throw new AppError(StatusCodes.BAD_REQUEST, "Cash payment already confirmed");
  }

  const updated = await JobRepository.markCashReceived(jobId);
  if (!updated) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Cash payment already confirmed or not eligible"
    );
  }

  const ownerId = String(job.postedBy?._id || job.postedBy);
  if (ownerId && ownerId !== String(userId)) {
    notifyUser(
      ownerId,
      "Cash payment received",
      `Helper confirmed cash payment for "${job.title}".`,
      { type: "cash_received", jobId: String(job._id) },
    ).catch(() => {});
  }

  JobRepository.appendHistory(jobId, {
    action: "completed",
    by: userId,
    byRole: "helper",
    note: "Cash payment received",
  }).catch(() => {});

  return updated;
};

// ─── Cancel Job ─────────────────────────────────────────
const cancelJob = async (
  userId: string,
  jobId: string,
  reason: string,
  isAdmin = false,
) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  const isOwner = String(job.postedBy?._id || job.postedBy) === String(userId);
  const isAssigned = String(job.assignedTo?._id || job.assignedTo) === String(userId);

  if (!isAdmin && !isOwner && !isAssigned) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not authorized to cancel this job",
    );
  }

  if (job.status === JobStatus.COMPLETED) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Completed jobs cannot be cancelled",
    );
  }

  if (job.status === JobStatus.CANCELLED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Job is already cancelled");
  }

  // Atomic cancel — only the winner runs refunds
  const updatedJob = await JobRepository.transitionToCancelled(jobId, {
    reason,
    cancelledBy: userId,
  });
  if (!updatedJob) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Job can no longer be cancelled");
  }

  // Cash: refund helper commission if it was deducted (use post-cancel snapshot)
  if (
    job.status === JobStatus.IN_PROGRESS &&
    job.paymentMethod === "cash" &&
    job.assignedTo &&
    ((updatedJob as any)?.commissionDeducted || job.commissionDeducted || 0) > 0
  ) {
    const commissionAmt =
      (updatedJob as any)?.commissionDeducted || job.commissionDeducted || 0;
    const helperId = String(job.assignedTo?._id || job.assignedTo);
    try {
      const { WalletRepository } = await import("../wallet/wallet.repository");
      await WalletRepository.refundCommission(
        helperId,
        commissionAmt,
        String(job._id),
      );
    } catch (err: any) {
      console.error("[JOB] Failed to refund commission to helper:", err.message);
      // Surface failure on the job so ops/support can see it
      try {
        await JobRepository.updateById(jobId, {
          refundStatus: "failed",
        } as any);
        await JobRepository.appendHistory(jobId, {
          action: "cancelled",
          by: userId,
          byRole: isAdmin ? "admin" : "user",
          note: `Commission refund failed (${commissionAmt} MAD): ${err.message}`,
        });
        notifyUser(
          helperId,
          "Commission refund issue",
          `We could not refund ${commissionAmt} MAD commission for a cancelled job. Contact support.`,
          { type: "payment_failed", jobId: String(job._id) },
        ).catch(() => {});
      } catch (_) {}
    }
  }

  // Online: gateway refund if a charge may exist.
  // Skip pending_payment with paymentStatus none (never charged).
  const maybeCharged =
    job.status === JobStatus.OPEN ||
    job.status === JobStatus.IN_PROGRESS ||
    (job.status === JobStatus.PENDING_PAYMENT &&
      (job as any).paymentStatus === "paid");

  if (
    job.paymentMethod === "online" &&
    maybeCharged &&
    (job.budget || 0) > 0
  ) {
    try {
      const { PaymentService } = await import("../payment/payment.service");
      const refund = await PaymentService.refundJobPayment(String(job._id), reason);
      // Only record when a completed payment actually existed
      if (refund.success || refund.message !== "No completed payment found for this job") {
        await JobRepository.updateById(jobId, {
          refundStatus: refund.success ? "refunded" : "failed",
          refundReference: refund.reference || undefined,
        } as any);
        if (refund.success) {
          try {
            await JobRepository.appendHistory(jobId, {
              action: "refunded",
              by: userId,
              byRole: isAdmin ? "admin" : "user",
              note: refund.reference || undefined,
            });
          } catch (_) {}
        }
      }
    } catch (err: any) {
      console.error("[JOB] Gateway refund failed:", err.message);
      await JobRepository.updateById(jobId, {
        refundStatus: "failed",
      } as any);
    }
  }

  // Return freshest job (includes refundStatus after updates)
  const finalJob = (await JobRepository.findById(jobId)) || updatedJob;

  try {
    const ownerId = String(job.postedBy?._id || job.postedBy);
    const helperId = job.assignedTo ? String(job.assignedTo?._id || job.assignedTo) : null;
    if (ownerId) emitToUser(ownerId, "job:cancelled", finalJob);
    if (helperId) emitToUser(helperId, "job:cancelled", finalJob);
  } catch (_) {}

  const cancelOwnerId = String(job.postedBy?._id || job.postedBy);
  const cancelHelperId = job.assignedTo
    ? String(job.assignedTo?._id || job.assignedTo)
    : null;
  const cancelReasonPreview = reason
    ? reason.length > 60
      ? `${reason.slice(0, 60)}…`
      : reason
    : "No reason given";

  if (cancelOwnerId && cancelOwnerId !== String(userId)) {
    notifyUser(
      cancelOwnerId,
      "Job cancelled",
      `"${job.title}" was cancelled. ${cancelReasonPreview}`,
      { type: "job_cancelled", jobId: String(job._id) },
    ).catch(() => {});
  }
  if (cancelHelperId && cancelHelperId !== String(userId)) {
    notifyUser(
      cancelHelperId,
      "Job cancelled",
      `"${job.title}" was cancelled. ${cancelReasonPreview}`,
      { type: "job_cancelled", jobId: String(job._id) },
    ).catch(() => {});
  }

  JobRepository.appendHistory(jobId, {
    action: "cancelled",
    by: userId,
    byRole: isAdmin ? "admin" : isOwner ? "client" : "helper",
    note: reason,
  }).catch(() => {});

  return finalJob;
};

// ─── Retry unpaid job checkout ─────────────────────────
const retryJobCheckout = async (userId: string, jobId: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }
  const ownerId = String(job.postedBy?._id || job.postedBy);
  if (ownerId !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Not your job");
  }
  if (job.status !== JobStatus.PENDING_PAYMENT) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This job is not waiting for payment",
    );
  }
  if ((job.budget || 0) <= 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid job amount");
  }

  const { PaymentService } = await import("../payment/payment.service");
  const session = await PaymentService.initializePayment(String(userId), {
    amount: job.budget,
    orderId: String(job._id),
    orderType: "job",
    metadata: {
      userId: String(userId),
      jobId: String(job._id),
    },
  });

  return {
    checkoutUrl: session.checkoutUrl,
    sessionId: session.sessionId,
    amount: job.budget,
  };
};

// ─── Delete Job ─────────────────────────────────────────
const deleteJob = async (userId: string, jobId: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  // Only owner can delete
  if (String(job.postedBy) !== String(userId)) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You can only delete your own jobs",
    );
  }

  // Only unpaid open or pending_payment jobs can be deleted
  if (
    job.status !== JobStatus.OPEN &&
    job.status !== JobStatus.PENDING_PAYMENT
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Only open or unpaid jobs can be deleted",
    );
  }

  await JobRepository.deleteById(jobId);
  return { message: "Job deleted successfully" };
};

export const JobService = {
  createJob,
  getJobs,
  getNearbyJobs,
  getJobById,
  acceptJob,
  updateJob,
  deleteJob,
  getMyBookings,
  getMyAssignedJobs,
  completeJob,
  confirmCashReceived,
  cancelJob,
  retryJobCheckout,
  notifyNearbyHelpers,
};
