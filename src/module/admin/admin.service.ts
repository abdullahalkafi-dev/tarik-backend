import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { Types } from "mongoose";
import { UserRepository } from "module/user/user.repository";
import { User } from "module/user/user.model";
import { AuthRepository } from "module/auth/auth.repository";
import { Auth } from "module/auth/auth.model";
import { revokeAllSessions } from "module/auth/auth.service";
import { HelperApplicationStatus } from "module/user/user.interface";
import { Job } from "module/job/job.model";
import { JobStatus } from "module/job/job.interface";
import { BlacklistedDocument } from "./blacklistedDocument.model";
import cacheService from "redis/cacheService";
import { buildCacheKey } from "redis/cache.utils";
import { resolveUrl } from "util/minio";
import { disconnectUserSockets } from "../../socket/socket.gateway";
import { AuthProvider, AuthRole, AuthStatus } from "module/auth/auth.interface";
import { notifyUserT } from "util/notifyUser";
import { isValidPermission, ROLE_PRESETS } from "../../config/permissions";
import { SettingsService } from "module/settings/settings.service";

const ACTIVE = [JobStatus.IN_PROGRESS, JobStatus.ON_THE_WAY, JobStatus.ARRIVED];
const STAFF_ROLES: string[] = [AuthRole.ADMIN, AuthRole.STAFF, AuthRole.SUPER_ADMIN];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const invalidateMe = (userId: string) => cacheService.deleteCache(buildCacheKey("user", "me", userId));

/**
 * Everything that must stop when an account is suspended / banned / has its
 * helper approval withdrawn: running jobs, open offers, live sessions, the live map.
 */
const endAccountActivity = async (userId: string, authId: string, reason: string, adminId: string) => {
  const { JobService } = await import("module/job/job.service");
  const { ChatService } = await import("module/chat/chat.service");
  const { SocketTrackingService } = await import("../../socket/socket.tracking");

  const jobs: any[] = await Job.find({
    $or: [{ postedBy: userId }, { assignedTo: userId }],
    status: { $in: [JobStatus.OPEN, JobStatus.PENDING_PAYMENT, ...ACTIVE] },
  } as any).select("_id");

  const cancelled: string[] = [];
  for (const j of jobs) {
    try {
      await JobService.cancelJob(adminId, String(j._id), reason, { isAdmin: true, code: "ACCOUNT_SUSPENDED" });
      cancelled.push(String(j._id));
    } catch (_) {
      // already finished by someone else
    }
  }
  await ChatService.releaseOffersOfUser(userId).catch(() => undefined);
  await SocketTrackingService.removeHelper(userId).catch(() => undefined);
  await revokeAllSessions(authId);
  disconnectUserSockets(userId);
  await invalidateMe(userId);
  return cancelled;
};

// ─── List Helper Applications ────────────────────────────
const listHelperApplications = async (
  status?: string,
  page: number = 1,
  limit: number = 20,
  search?: string,
) => {
  const filter: any = { isHelperFormSubmitted: true };
  if (status) {
    filter.helperApplicationStatus = status;
  }
  if (search) {
    const re = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [{ name: re }, { phone: re }, { email: re }, { maskedDocumentNumber: re }, { city: re }];
  }

  const skip = (page - 1) * limit;

  const [helpers, total] = await Promise.all([
    UserRepository.findMany(filter, {
      select:
        "auth name email phone avatar helperApplicationStatus rejectionReason age city language serviceType pricePerHour experience serviceRadius documentType documentUrl selfieUrl diditStatus diditDecisionReason diditDiagnostics maskedDocumentNumber appealStatus appealCount appealMessage appealedAt isBlocked blockedReason createdAt",
      sort: { createdAt: -1 },
      skip,
      limit,
      populate: "serviceType",
    }),
    UserRepository.count(filter),
  ]);

  // The ban flag lives on the Auth record: add it so the console can tell "banned" from "rejected".
  const auths = await Auth.find({ _id: { $in: helpers.map((h: any) => h.auth) } })
    .select("isBlacklisted")
    .lean();
  const blacklisted = new Map(auths.map((a: any) => [String(a._id), !!a.isBlacklisted]));

  const resolvedHelpers = helpers.map((h: any) => {
    const obj = h.toObject();
    return {
      ...obj,
      isBlacklisted: blacklisted.get(String(obj.auth)) || false,
      avatar: resolveUrl(obj.avatar),
      documentUrl: resolveUrl(obj.documentUrl),
      selfieUrl: resolveUrl(obj.selfieUrl),
    };
  });

  return {
    docs: resolvedHelpers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// ─── Get Single Helper Details (Admin) ───────────────────
const getHelperById = async (userId: string) => {
  const user = await UserRepository.findById(userId, {
    populate: "serviceType",
  });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "Helper not found");
  }

  const auth = await AuthRepository.findById(String(user.auth));

  const [counts, wallet] = await Promise.all([
    Job.aggregate([
      { $match: { assignedTo: user._id } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    import("module/wallet/wallet.model").then(({ Wallet }) => Wallet.findOne({ user: user._id }).select("balance").lean()),
  ]);
  const byStatus: Record<string, number> = {};
  for (const c of counts) byStatus[c._id] = c.n;

  const isDocBlacklisted = user.documentNumberHash
    ? !!(await BlacklistedDocument.findOne({ documentHash: user.documentNumberHash }))
    : false;

  const obj: any = user.toObject();
  delete obj.deviceTokens;
  delete obj.deviceToken;

  return {
    ...obj,
    avatar: resolveUrl(user.avatar),
    documentUrl: resolveUrl(user.documentUrl),
    selfieUrl: resolveUrl(user.selfieUrl),
    profilePhotos: user.profilePhotos?.map(resolveUrl).filter(Boolean) as string[],
    isBlacklisted: auth?.isBlacklisted || false,
    blacklistedReason: auth?.blacklistedReason,
    blacklistedAt: auth?.blacklistedAt,
    isDocBlacklisted,
    totalAssignedJobs: Object.values(byStatus).reduce((a, b) => a + b, 0),
    jobStats: {
      completed: byStatus[JobStatus.COMPLETED] || 0,
      cancelled: byStatus[JobStatus.CANCELLED] || 0,
      active: ACTIVE.reduce((n, s) => n + (byStatus[s] || 0), 0),
    },
    walletBalance: wallet?.balance ?? 0,
  };
};

// ─── List Regular Users / Customers ──────────────────────
const listUsers = async (
  page = 1,
  limit = 20,
  search?: string,
  status?: "active" | "blocked",
) => {
  const match: any = { isDeleted: false };
  if (status === "blocked") match.isBlocked = true;
  if (status === "active") match.isBlocked = { $ne: true };
  if (search) {
    const re = { $regex: escapeRegex(search), $options: "i" };
    match.$or = [{ name: re }, { email: re }, { phone: re }];
  }

  const skip = (page - 1) * limit;

  // Customers = accounts whose role is "user" (a client who merely opened the
  // helper form is still a customer; staff / helpers are not).
  const pipeline: any[] = [
    { $match: match },
    { $lookup: { from: "auths", localField: "auth", foreignField: "_id", as: "authDoc" } },
    { $match: { "authDoc.role": AuthRole.USER } },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        docs: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: "jobs",
              let: { uid: "$_id" },
              pipeline: [
                { $match: { $expr: { $eq: ["$postedBy", "$$uid"] } } },
                { $count: "n" },
              ],
              as: "bookingAgg",
            },
          },
          {
            $project: {
              name: 1,
              email: 1,
              phone: 1,
              avatar: 1,
              address: 1,
              city: 1,
              isBlocked: 1,
              blockedReason: 1,
              createdAt: 1,
              totalBookings: { $ifNull: [{ $arrayElemAt: ["$bookingAgg.n", 0] }, 0] },
            },
          },
        ],
        total: [{ $count: "n" }],
      },
    },
  ];

  const [facet] = await User.aggregate(pipeline).exec();
  const total = facet?.total?.[0]?.n || 0;
  const docs = (facet?.docs || []).map((u: any) => ({ ...u, avatar: resolveUrl(u.avatar) }));

  return { docs, total, page, limit, totalPages: Math.ceil(total / limit) };
};

// ─── Get Single User Details (Admin) ─────────────────────
const getUserById = async (userId: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const totalBookings = await Job.countDocuments({ postedBy: user._id });
  const obj: any = user.toObject();
  delete obj.deviceTokens;
  delete obj.deviceToken;

  return {
    ...obj,
    avatar: resolveUrl(user.avatar),
    totalBookings,
  };
};

// ─── Approve Helper (Manual Override) ────────────────────
const approveHelper = async (userId: string, adminId?: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  if (user.helperApplicationStatus === HelperApplicationStatus.APPROVED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Helper is already approved");
  }
  if (!user.isHelperFormSubmitted || !user.serviceType) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "The application is incomplete (no helper form submitted). It cannot be approved yet.",
      { code: "APPLICATION_INCOMPLETE" },
    );
  }

  const previousStatus = user.helperApplicationStatus || "pending";

  const updatedUser = await UserRepository.updateById(userId, {
    helperApplicationStatus: HelperApplicationStatus.APPROVED,
    appealStatus: "approved",
    rejectionReason: null,
    $push: {
      applicationHistory: {
        appliedAt: new Date(),
        status: HelperApplicationStatus.APPROVED,
        reviewedAt: new Date(),
      },
      adminActionHistory: {
        action: "MANUAL_APPROVE_OVERRIDE",
        adminId: adminId ? new Types.ObjectId(adminId) : user._id,
        reason: "Manual admin approval",
        previousStatus,
        newStatus: "approved",
        timestamp: new Date(),
      },
    },
  });

  // The API reads the role from the database, so this applies immediately.
  await AuthRepository.updateById(String(user.auth), { role: AuthRole.HELPER });
  await invalidateMe(userId);

  notifyUserT(userId, "helper.approved", {}, { type: "kyc_approved", status: "approved" }).catch(() => undefined);
  const { emitToUser } = await import("../../socket/socket.gateway");
  emitToUser(userId, "kyc:updated", { status: "approved" });

  return updatedUser;
};

// ─── Reject Helper / revoke approval ─────────────────────
const rejectHelper = async (userId: string, reason: string, adminId?: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const trimmed = (reason || "").trim();
  if (trimmed.length < 5) {
    throw new AppError(StatusCodes.BAD_REQUEST, "A reason of at least 5 characters is required", {
      code: "REASON_REQUIRED",
    });
  }

  const wasApproved = user.helperApplicationStatus === HelperApplicationStatus.APPROVED;
  const previousStatus = user.helperApplicationStatus || "pending";

  // Revoking an approved helper: first deal with the jobs they are in the middle of.
  if (wasApproved) {
    const active: any[] = await Job.find({ assignedTo: userId, status: { $in: ACTIVE } } as any).select("title");
    if (active.length) {
      throw new AppError(
        StatusCodes.CONFLICT,
        "This helper has jobs in progress. Cancel or complete them before withdrawing the approval.",
        { code: "HAS_ACTIVE_JOBS", params: { count: active.length, jobs: active.map((j) => String(j._id)) } },
      );
    }
  }

  const updatedUser = await UserRepository.updateById(userId, {
    helperApplicationStatus: HelperApplicationStatus.REJECTED,
    appealStatus: "rejected",
    rejectionReason: trimmed,
    $push: {
      applicationHistory: {
        appliedAt: new Date(),
        status: HelperApplicationStatus.REJECTED,
        rejectionReason: trimmed,
        reviewedAt: new Date(),
      },
      adminActionHistory: {
        action: wasApproved ? "ADMIN_REVOKED_APPROVAL" : "ADMIN_REJECTED_APPLICATION",
        adminId: adminId ? new Types.ObjectId(adminId) : user._id,
        reason: trimmed,
        previousStatus,
        newStatus: "rejected",
        timestamp: new Date(),
      },
    },
  });

  if (wasApproved) {
    // Helper-only endpoints must close immediately; open offers go back to the clients.
    await AuthRepository.updateById(String(user.auth), { role: AuthRole.USER });
    const { ChatService } = await import("module/chat/chat.service");
    await ChatService.releaseOffersOfUser(userId).catch(() => undefined);
    const { SocketTrackingService } = await import("../../socket/socket.tracking");
    await SocketTrackingService.removeHelper(userId).catch(() => undefined);
  }

  await invalidateMe(userId);
  notifyUserT(userId, wasApproved ? "helper.revoked" : "helper.rejected", { reason: trimmed }, {
    type: "kyc_rejected",
    status: "rejected",
  }).catch(() => undefined);
  const { emitToUser } = await import("../../socket/socket.gateway");
  emitToUser(userId, "kyc:updated", { status: "rejected" });

  return updatedUser;
};

// ─── Permanent Ban Helper ────────────────────────────────
const permanentBanHelper = async (userId: string, adminId: string, reason: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  await assertNotStaffAccount(String(user.auth));

  const previousStatus = user.helperApplicationStatus || "pending";

  // 1. Blacklist Auth and User
  await AuthRepository.updateById(String(user.auth), {
    isBlacklisted: true,
    blacklistedReason: reason,
    blacklistedAt: new Date(),
  });

  await UserRepository.updateById(userId, {
    isBlocked: true,
    blockedReason: reason,
    blockedAt: new Date(),
    helperApplicationStatus: HelperApplicationStatus.REJECTED,
    appealStatus: "max_exceeded",
    rejectionReason: `Permanently banned: ${reason}`,
    $push: {
      adminActionHistory: {
        action: "PERMANENT_BAN_AND_BLACKLIST",
        adminId: new Types.ObjectId(adminId),
        reason,
        previousStatus,
        newStatus: "banned",
        timestamp: new Date(),
      },
    },
  });

  // 2. Blacklist document hash if available
  if (user.documentNumberHash) {
    await BlacklistedDocument.findOneAndUpdate(
      { documentHash: user.documentNumberHash },
      {
        documentHash: user.documentNumberHash,
        documentType: user.documentType,
        maskedDocumentNumber: user.maskedDocumentNumber,
        reason,
        blacklistedBy: new Types.ObjectId(adminId),
        originalUserId: new Types.ObjectId(userId),
      },
      { upsert: true },
    );
  }

  // 3. Tell them, then stop everything they were doing (jobs cancelled with refunds, sessions ended).
  await notifyUserT(userId, "helper.banned", { reason }, { type: "account_banned" }).catch(() => undefined);
  const cancelledJobs = await endAccountActivity(userId, String(user.auth), `Account banned: ${reason}`, adminId);

  return {
    success: true,
    message: "User and identity document permanently blacklisted",
    cancelledJobs: cancelledJobs.length,
  };
};

// ─── Unban Helper ────────────────────────────────────────
const unbanHelper = async (userId: string, adminId: string, reason?: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  await AuthRepository.updateById(String(user.auth), {
    isBlacklisted: false,
    $unset: { blacklistedReason: 1, blacklistedAt: 1 },
  } as any);

  await UserRepository.updateById(userId, {
    isBlocked: false,
    appealStatus: "none",
    appealCount: 0,
    $unset: { blockedReason: 1, blockedAt: 1 },
    $push: {
      adminActionHistory: {
        action: "UNBAN_AND_CLEAR_BLACKLIST",
        adminId: new Types.ObjectId(adminId),
        reason: reason || "Admin cleared ban / whitelist restored",
        previousStatus: "banned",
        newStatus: user.helperApplicationStatus || "pending",
        timestamp: new Date(),
      },
    },
  } as any);

  if (user.documentNumberHash) {
    await BlacklistedDocument.deleteOne({ documentHash: user.documentNumberHash });
  }

  await invalidateMe(userId);
  notifyUserT(userId, "account.unblocked", {}, { type: "account_unblocked" }).catch(() => undefined);

  return { success: true, message: "User and identity document unbanned successfully" };
};

const assertNotStaffAccount = async (authId: string) => {
  const auth = await AuthRepository.findById(authId);
  if (auth && (auth.isSuperAdmin || STAFF_ROLES.includes(auth.role))) {
    throw new AppError(StatusCodes.FORBIDDEN, "Admin and staff accounts cannot be blocked here", {
      code: "STAFF_PROTECTED",
    });
  }
};

// ─── Block / unblock a user (explicit, with a reason) ────
const blockUser = async (userId: string, adminId: string, reason: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  await assertNotStaffAccount(String(user.auth));
  if (user.isBlocked) {
    throw new AppError(StatusCodes.CONFLICT, "This user is already blocked", { code: "ALREADY_BLOCKED" });
  }

  await UserRepository.updateById(userId, {
    isBlocked: true,
    blockedReason: reason,
    blockedAt: new Date(),
    $push: {
      adminActionHistory: {
        action: "ADMIN_BLOCKED_USER",
        adminId: new Types.ObjectId(adminId),
        reason,
        previousStatus: "active",
        newStatus: "blocked",
        timestamp: new Date(),
      },
    },
  } as any);

  await notifyUserT(userId, "account.blocked", {}, { type: "account_blocked" }).catch(() => undefined);
  const cancelled = await endAccountActivity(userId, String(user.auth), `Account suspended: ${reason}`, adminId);

  return { _id: user._id, isBlocked: true, cancelledJobs: cancelled.length };
};

const unblockUser = async (userId: string, adminId: string, reason?: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }
  if (!user.isBlocked) {
    throw new AppError(StatusCodes.CONFLICT, "This user is not blocked", { code: "NOT_BLOCKED" });
  }

  await UserRepository.updateById(userId, {
    isBlocked: false,
    $unset: { blockedReason: 1, blockedAt: 1 },
    $push: {
      adminActionHistory: {
        action: "ADMIN_UNBLOCKED_USER",
        adminId: new Types.ObjectId(adminId),
        reason: reason || "Unblocked by admin",
        previousStatus: "blocked",
        newStatus: "active",
        timestamp: new Date(),
      },
    },
  } as any);

  await invalidateMe(userId);
  notifyUserT(userId, "account.unblocked", {}, { type: "account_unblocked" }).catch(() => undefined);
  return { _id: user._id, isBlocked: false };
};

// ─── Get Stats ───────────────────────────────────────────
const pct = (current: number, previous: number): number | null => {
  if (previous === 0) return current === 0 ? 0 : null; // null = no basis for a percentage
  return Math.round(((current - previous) / previous) * 1000) / 10;
};

const getStats = async () => {
  const { PaymentTransaction } = await import("module/payment/payment.model");
  const { PaymentStatus } = await import("module/payment/payment.interface");
  const fee = await SettingsService.getFeePercentage();

  const now = new Date();
  const startThis = new Date(now.getFullYear(), now.getMonth(), 1);
  const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  // Commission = what the platform actually kept from COMPLETED jobs:
  //  cash   → the commission the helper prepaid,
  //  online → budget minus the helper's net (stored when the job was accepted).
  // Wallet top-ups are NOT revenue.
  const commissionExpr = {
    $cond: [
      { $eq: ["$paymentMethod", "cash"] },
      { $ifNull: ["$commissionDeducted", 0] },
      {
        $subtract: [
          "$budget",
          { $ifNull: ["$helperNet", { $round: [{ $multiply: ["$budget", 1 - fee / 100] }, 0] }] },
        ],
      },
    ],
  };

  const customerMatch = (extra: Record<string, unknown> = {}) => [
    { $match: { isDeleted: false, ...extra } },
    { $lookup: { from: "auths", localField: "auth", foreignField: "_id", as: "a" } },
    { $match: { "a.role": AuthRole.USER } },
    { $count: "n" },
  ];

  const [
    customersAll,
    customersThis,
    customersPrev,
    pendingApplications,
    approvedHelpers,
    rejectedHelpers,
    pendingAppeals,
    helpersThis,
    helpersPrev,
    totalBookings,
    bookingsThis,
    bookingsPrev,
    pendingJobs,
    activeJobsNow,
    activeWorkerIds,
    earningsAll,
    earningsThis,
    earningsPrev,
    topupVolume,
  ] = await Promise.all([
    User.aggregate(customerMatch()),
    User.aggregate(customerMatch({ createdAt: { $gte: startThis } })),
    User.aggregate(customerMatch({ createdAt: { $gte: startPrev, $lt: startThis } })),
    UserRepository.count({ isHelperFormSubmitted: true, helperApplicationStatus: HelperApplicationStatus.PENDING }),
    UserRepository.count({ isHelperFormSubmitted: true, helperApplicationStatus: HelperApplicationStatus.APPROVED, isDeleted: false }),
    UserRepository.count({ isHelperFormSubmitted: true, helperApplicationStatus: HelperApplicationStatus.REJECTED }),
    UserRepository.count({ isHelperFormSubmitted: true, helperApplicationStatus: HelperApplicationStatus.PENDING_APPEAL }),
    // New helpers = approvals recorded in the application history (not any profile edit).
    UserRepository.count({ helperApplicationStatus: HelperApplicationStatus.APPROVED, applicationHistory: { $elemMatch: { status: HelperApplicationStatus.APPROVED, reviewedAt: { $gte: startThis } } } } as any),
    UserRepository.count({ helperApplicationStatus: HelperApplicationStatus.APPROVED, applicationHistory: { $elemMatch: { status: HelperApplicationStatus.APPROVED, reviewedAt: { $gte: startPrev, $lt: startThis } } } } as any),
    Job.countDocuments({}),
    Job.countDocuments({ createdAt: { $gte: startThis } }),
    Job.countDocuments({ createdAt: { $gte: startPrev, $lt: startThis } }),
    Job.countDocuments({ status: JobStatus.OPEN }),
    Job.countDocuments({ status: { $in: ACTIVE } } as any),
    // "Active worker" = approved helper who completed a job in the last 30 days.
    Job.distinct("assignedTo", { status: JobStatus.COMPLETED, completedAt: { $gte: thirtyDaysAgo } } as any),
    Job.aggregate([
      { $match: { status: JobStatus.COMPLETED } },
      { $group: { _id: null, gross: { $sum: "$budget" }, commission: { $sum: commissionExpr } } },
    ]),
    Job.aggregate([
      { $match: { status: JobStatus.COMPLETED, completedAt: { $gte: startThis } } },
      { $group: { _id: null, commission: { $sum: commissionExpr } } },
    ]),
    Job.aggregate([
      { $match: { status: JobStatus.COMPLETED, completedAt: { $gte: startPrev, $lt: startThis } } },
      { $group: { _id: null, commission: { $sum: commissionExpr } } },
    ]),
    PaymentTransaction.aggregate([
      { $match: { status: PaymentStatus.COMPLETED, orderType: "wallet_topup" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const n = (rows: any[]) => rows?.[0]?.n || 0;
  const commissionAll = earningsAll[0]?.commission || 0;
  const commissionThis = earningsThis[0]?.commission || 0;
  const commissionPrev = earningsPrev[0]?.commission || 0;

  return {
    totalUsers: n(customersAll), // customers only
    totalHelpers: approvedHelpers, // approved helpers (not applicants)
    pendingApplications,
    approvedHelpers,
    rejectedHelpers,
    pendingAppeals,
    totalBookings,
    activeWorkers: activeWorkerIds.length,
    activeJobsNow,
    pendingJobs, // open jobs still waiting for a helper
    platformEarnings: Math.round(commissionAll),
    grossVolume: Math.round(earningsAll[0]?.gross || 0),
    walletTopupVolume: Math.round(topupVolume[0]?.total || 0),
    feePercentage: fee,
    trends: {
      // Percentage change this month vs last month; null = nothing to compare with.
      customers: pct(n(customersThis), n(customersPrev)),
      helpers: pct(helpersThis, helpersPrev),
      bookings: pct(bookingsThis, bookingsPrev),
      earnings: pct(commissionThis, commissionPrev),
    },
  };
};

// ─── Get Admin Profile ───────────────────────────────────
const getAdminProfile = async (userId: string) => {
  const user = await UserRepository.findById(userId, { populate: "auth" });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "Admin profile not found");
  }
  const auth = user.auth as any;
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: resolveUrl(user.avatar),
    role: auth?.role,
    isSuperAdmin: auth?.isSuperAdmin || false,
    permissions: auth?.isSuperAdmin ? ["*"] : auth?.permissions || [],
    status: auth?.status,
    mustChangePassword: !!auth?.mustChangePassword,
  };
};

// ─── Update Admin/Staff Profile (name, phone, avatar) ────
const updateAdminProfile = async (
  userId: string,
  payload: { name?: string; phone?: string; avatar?: string },
) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "Admin profile not found");
  }

  const updates: any = {};
  if (payload.name != null && String(payload.name).trim()) {
    updates.name = String(payload.name).trim();
  }
  if (payload.phone !== undefined) {
    updates.phone = payload.phone || undefined;
  }
  if (payload.avatar !== undefined) {
    const { assertOwnUploadKey } = await import("util/uploadKey");
    updates.avatar = payload.avatar
      ? assertOwnUploadKey(payload.avatar, userId, { allowed: [user.avatar || ""], kinds: ["images"] })
      : "";
  }

  if (Object.keys(updates).length) {
    await UserRepository.updateById(userId, updates);
  }

  return getAdminProfile(userId);
};

// ─── List Staff ──────────────────────────────────────────
const getStaffList = async (page: number = 1, limit: number = 20, search?: string) => {
  const authRecords = await AuthRepository.findMany(
    { role: { $in: [AuthRole.ADMIN, AuthRole.STAFF] }, isDeleted: false },
    { select: "email role status isSuperAdmin permissions mustChangePassword createdAt" },
  );

  const authIds = authRecords.map((a: any) => a._id);
  const users = await UserRepository.findMany(
    { auth: { $in: authIds }, isDeleted: false },
    { select: "name email phone auth createdAt", populate: "auth" },
  );

  let results = users.map((u: any) => {
    const auth = u.auth as any;
    return {
      _id: u._id,
      name: u.name,
      email: u.email || auth?.email,
      phone: u.phone,
      role: auth?.role,
      isSuperAdmin: auth?.isSuperAdmin || false,
      status: auth?.status,
      permissions: auth?.permissions || [],
      mustChangePassword: !!auth?.mustChangePassword,
      createdAt: u.createdAt,
    };
  });

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(
      (r: any) =>
        r.name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.includes(q),
    );
  }

  const total = results.length;
  const skip = (page - 1) * limit;
  const docs = results.slice(skip, skip + limit);

  return {
    docs,
    total,
    page,
    limit,
    presets: Object.entries(ROLE_PRESETS).map(([key, v]) => ({ key, label: v.label, permissions: v.permissions })),
  };
};

const resolvePermissions = (input: { rolePreset?: string; permissions?: string[] }): string[] => {
  if (input.rolePreset) {
    const preset = ROLE_PRESETS[input.rolePreset];
    if (!preset) throw new AppError(StatusCodes.BAD_REQUEST, "Unknown staff role");
    return [...preset.permissions];
  }
  const perms = input.permissions || [];
  const invalid = perms.filter((p) => !isValidPermission(p));
  if (invalid.length) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Unknown permission: ${invalid.join(", ")}`, {
      code: "UNKNOWN_PERMISSION",
    });
  }
  return perms;
};

// ─── Create Staff ────────────────────────────────────────
const createStaff = async (payload: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  rolePreset?: string;
  permissions?: string[];
}) => {
  const { name, phone, password } = payload;
  const email = payload.email.trim().toLowerCase();
  // Safe default: support-level access. Full access must be chosen on purpose.
  const permissions = resolvePermissions({
    rolePreset: payload.rolePreset ?? (payload.permissions ? undefined : "support"),
    permissions: payload.permissions,
  });

  const existing = await AuthRepository.findOne({ email, isDeleted: false });
  if (existing) {
    throw new AppError(StatusCodes.CONFLICT, "An account with this email already exists", {
      code: "EMAIL_TAKEN",
    });
  }

  // Create auth record — verified, active, and the owner must choose their own password at first login.
  const auth = await AuthRepository.create({
    email,
    password, // hashed by pre-save hook
    loginProvider: AuthProvider.EMAIL,
    role: AuthRole.STAFF,
    status: AuthStatus.ACTIVE,
    isEmailVerified: true,
    mustChangePassword: true,
    permissions,
  } as any);

  const user = await UserRepository.create({
    auth: new Types.ObjectId(auth._id),
    name,
    email,
    phone,
  } as any);

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: AuthRole.STAFF,
    status: AuthStatus.ACTIVE,
    permissions,
    mustChangePassword: true,
    createdAt: (user as any).createdAt,
  };
};

// ─── Update Staff ────────────────────────────────────────
const updateStaff = async (
  staffUserId: string,
  updates: {
    rolePreset?: string;
    permissions?: string[];
    status?: string;
    name?: string;
    phone?: string;
  },
) => {
  const user = await UserRepository.findById(staffUserId, { populate: "auth" });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "Staff member not found");
  }

  const auth = user.auth as any;
  if (!auth) {
    throw new AppError(StatusCodes.NOT_FOUND, "Auth record not found");
  }

  // Prevent modifying the root Super Admin
  if (auth.isSuperAdmin) {
    throw new AppError(StatusCodes.FORBIDDEN, "The Super Admin account cannot be modified");
  }

  const authUpdates: any = {};
  if (updates.rolePreset !== undefined || updates.permissions !== undefined) {
    authUpdates.permissions = resolvePermissions(updates);
  }
  if (updates.status !== undefined) authUpdates.status = updates.status;

  if (Object.keys(authUpdates).length > 0) {
    await AuthRepository.updateById(String(auth._id), authUpdates);
  }

  // Suspending ends every session right away (tokens, refresh tokens, live sockets).
  if (updates.status === AuthStatus.SUSPENDED) {
    await revokeAllSessions(String(auth._id));
    disconnectUserSockets(staffUserId);
  }

  const userUpdates: any = {};
  if (updates.name) userUpdates.name = updates.name;
  if (updates.phone) userUpdates.phone = updates.phone;

  if (Object.keys(userUpdates).length > 0) {
    await UserRepository.updateById(staffUserId, userUpdates);
  }

  return { message: "Staff member updated successfully" };
};

// ─── Delete Staff ────────────────────────────────────────
const deleteStaff = async (staffUserId: string) => {
  const user = await UserRepository.findById(staffUserId, { populate: "auth" });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "Staff member not found");
  }

  const auth = user.auth as any;
  if (auth?.isSuperAdmin) {
    throw new AppError(StatusCodes.FORBIDDEN, "The Super Admin account cannot be deleted");
  }

  await AuthRepository.updateById(String(auth._id), { isDeleted: true, $unset: { email: 1 } } as any);
  await UserRepository.updateById(staffUserId, { isDeleted: true } as any);
  await revokeAllSessions(String(auth._id));
  disconnectUserSockets(staffUserId);

  return { message: "Staff member removed successfully" };
};

// ─── Helper Job History ──────────────────────────────────────
const getHelperJobs = async (userId: string, page: number = 1, limit: number = 10) => {
  const { JobRepository } = await import("../job/job.repository");
  const filter = { assignedTo: new Types.ObjectId(userId) };
  return JobRepository.findAll(filter, { page, limit: Math.min(limit, 100) });
};

// ─── User Booking History ────────────────────────────────────
const getUserBookings = async (userId: string, page: number = 1, limit: number = 10) => {
  const { JobRepository } = await import("../job/job.repository");
  const filter = { postedBy: new Types.ObjectId(userId) };
  return JobRepository.findAll(filter, { page, limit: Math.min(limit, 100) });
};

// ─── Live Helper Locations (Fleet Map) ──────────────────────
/**
 * Only helpers that really reported a position: live ones (last 5 min) and those
 * seen in the last 24 h. The time shown is the time of the last real GPS ping,
 * and phone numbers are NOT part of this list (see getHelperContact).
 */
const getLiveHelperLocations = async (opts: { liveOnly?: boolean; limit?: number } = {}) => {
  const { SocketTrackingService } = await import("../../socket/socket.tracking");
  const liveHelpers = await SocketTrackingService.getAllLiveHelpers();
  const liveMap = new Map<string, any>();
  for (const item of liveHelpers) {
    liveMap.set(item.helperId, item);
  }

  const since = new Date(Date.now() - 24 * 3_600_000);
  const filter: any = {
    isHelperFormSubmitted: true,
    helperApplicationStatus: HelperApplicationStatus.APPROVED,
    isBlocked: false,
    isDeleted: false,
    $or: [
      { _id: { $in: [...liveMap.keys()].filter((id) => Types.ObjectId.isValid(id)) } },
      ...(opts.liveOnly ? [] : [{ lastKnownLocationAt: { $gte: since } }]),
    ],
  };

  const helpers = await UserRepository.findMany(filter, {
    select: "name avatar lastKnownLocation lastKnownLocationAt location serviceType rating reviewCount city",
    populate: "serviceType",
    limit: Math.min(opts.limit || 500, 1000),
  });

  return helpers
    .map((h: any) => {
      const id = String(h._id);
      const live = liveMap.get(id);
      const coords = live
        ? [live.longitude, live.latitude]
        : h.lastKnownLocation?.coordinates?.length === 2
          ? h.lastKnownLocation.coordinates
          : null;

      return {
        id,
        name: h.name,
        avatar: resolveUrl(h.avatar),
        serviceType: h.serviceType?.name || "Helper",
        city: h.city,
        rating: h.rating || 0,
        reviewCount: h.reviewCount || 0,
        coordinates: coords,
        isLive: !!live,
        activeJobId: live?.jobId || null,
        // Time of the last real GPS ping — never the profile edit time.
        lastSeenAt: live ? new Date(live.updatedAt) : h.lastKnownLocationAt,
      };
    })
    .filter((h) => h.coordinates && h.coordinates.length === 2);
};

/** Click-to-reveal contact for the console: the access is written to the audit trail. */
const getHelperContact = async (userId: string, adminId: string) => {
  const user = await UserRepository.findById(userId, { select: "name phone email" });
  if (!user) throw new AppError(StatusCodes.NOT_FOUND, "Helper not found");
  await UserRepository.updateById(userId, {
    $push: {
      adminActionHistory: {
        action: "ADMIN_VIEWED_CONTACT",
        adminId: new Types.ObjectId(adminId),
        reason: "Contact details revealed in the console",
        timestamp: new Date(),
      },
    },
  } as any);
  return { phone: user.phone, email: user.email };
};

export const AdminService = {
  listHelperApplications,
  getHelperById,
  listUsers,
  getUserById,
  approveHelper,
  rejectHelper,
  permanentBanHelper,
  unbanHelper,
  blockUser,
  unblockUser,
  getStats,
  // Staff Management
  getAdminProfile,
  updateAdminProfile,
  getStaffList,
  createStaff,
  updateStaff,
  deleteStaff,
  // Job/Booking History
  getHelperJobs,
  getUserBookings,
  getLiveHelperLocations,
  getHelperContact,
};
