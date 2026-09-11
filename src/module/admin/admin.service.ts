import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { UserRepository } from "module/user/user.repository";
import { AuthRepository } from "module/auth/auth.repository";
import { HelperApplicationStatus } from "module/user/user.interface";
import { JobStatus } from "module/job/job.interface";
import { BlacklistedDocument } from "./blacklistedDocument.model";
import cacheService from "redis/cacheService";
import { buildCacheKey } from "redis/cache.utils";
import { resolveUrl } from "util/minio";
import { disconnectUserSockets } from "../../socket/socket.gateway";
import { Types } from "mongoose";
import { AuthProvider, AuthRole, AuthStatus } from "module/auth/auth.interface";

// ─── List Helper Applications ────────────────────────────
const listHelperApplications = async (
  status?: string,
  page: number = 1,
  limit: number = 20,
) => {
  const filter: any = { isHelperFormSubmitted: true };
  if (status) {
    filter.helperApplicationStatus = status;
  }

  const skip = (page - 1) * limit;

  const [helpers, total] = await Promise.all([
    UserRepository.findMany(filter, {
      select:
        "name email phone avatar helperApplicationStatus rejectionReason age city language serviceType pricePerHour experience serviceRadius documentType documentUrl selfieUrl diditStatus diditDecisionReason diditDiagnostics maskedDocumentNumber appealStatus appealCount appealMessage appealedAt isBlocked createdAt",
      sort: { createdAt: -1 },
      skip,
      limit,
      populate: "serviceType",
    }),
    UserRepository.count(filter),
  ]);

  // Resolve image keys to full URLs
  const resolvedHelpers = helpers.map((h: any) => {
    const obj = h.toObject();
    return {
      ...obj,
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

  const { JobRepository } = await import("module/job/job.repository");
  const jobStats = await JobRepository.findAll({ assignedTo: userId });

  const isDocBlacklisted = user.documentNumberHash
    ? !!(await BlacklistedDocument.findOne({ documentHash: user.documentNumberHash }))
    : false;

  return {
    ...user.toObject(),
    avatar: resolveUrl(user.avatar),
    documentUrl: resolveUrl(user.documentUrl),
    selfieUrl: resolveUrl(user.selfieUrl),
    profilePhotos: user.profilePhotos?.map(resolveUrl).filter(Boolean) as string[],
    isBlacklisted: auth?.isBlacklisted || false,
    blacklistedReason: auth?.blacklistedReason,
    blacklistedAt: auth?.blacklistedAt,
    isDocBlacklisted,
    totalAssignedJobs: jobStats.total || 0,
  };
};

// ─── List Regular Users / Customers ──────────────────────
const listUsers = async (page = 1, limit = 20, search?: string) => {
  const filter: any = { isDeleted: false, isHelperFormSubmitted: { $ne: true } };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    UserRepository.findMany(filter, {
      select: "name email phone avatar address city isBlocked createdAt",
      sort: { createdAt: -1 },
      skip,
      limit,
    }),
    UserRepository.count(filter),
  ]);

  const resolvedUsers = users.map((u: any) => {
    const obj = u.toObject();
    return {
      ...obj,
      avatar: resolveUrl(obj.avatar),
    };
  });

  return {
    docs: resolvedUsers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// ─── Get Single User Details (Admin) ─────────────────────
const getUserById = async (userId: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const { JobRepository } = await import("module/job/job.repository");
  const jobStats = await JobRepository.findAll({ postedBy: userId });

  return {
    ...user.toObject(),
    avatar: resolveUrl(user.avatar),
    totalBookings: jobStats.total || 0,
  };
};

// ─── Approve Helper (Manual Override) ────────────────────
const approveHelper = async (userId: string, adminId?: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  if (user.helperApplicationStatus === HelperApplicationStatus.APPROVED) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Helper is already approved",
    );
  }

  const previousStatus = user.helperApplicationStatus || "pending";

  // Update user status
  const updatedUser = await UserRepository.updateById(userId, {
    helperApplicationStatus: HelperApplicationStatus.APPROVED,
    appealStatus: "approved",
    rejectionReason: null,
    $push: {
      adminActionHistory: {
        action: "MANUAL_APPROVE_OVERRIDE",
        adminId: adminId ? new Types.ObjectId(adminId) : user.auth,
        reason: "Manual admin approval override",
        previousStatus,
        newStatus: "approved",
        timestamp: new Date(),
      },
    },
  });

  // Update auth role to helper
  await AuthRepository.updateById(String(user.auth), {
    role: "helper",
  });

  // Invalidate cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return updatedUser;
};

// ─── Reject Helper ───────────────────────────────────────
const rejectHelper = async (userId: string, reason: string, adminId?: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // Allow rejecting if in pending, pending_appeal, or already rejected but updating feedback
  const previousStatus = user.helperApplicationStatus || "pending";

  const updatedUser = await UserRepository.updateById(userId, {
    helperApplicationStatus: HelperApplicationStatus.REJECTED,
    appealStatus: "rejected",
    rejectionReason: reason,
    $push: {
      applicationHistory: {
        appliedAt: new Date(),
        status: HelperApplicationStatus.REJECTED,
        rejectionReason: reason,
        reviewedAt: new Date(),
      },
      adminActionHistory: {
        action: "ADMIN_REJECTED_APPLICATION",
        adminId: adminId ? new Types.ObjectId(adminId) : user.auth,
        reason,
        previousStatus,
        newStatus: "rejected",
        timestamp: new Date(),
      },
    },
  });

  // Invalidate cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return updatedUser;
};

// ─── Permanent Ban Helper ────────────────────────────────
const permanentBanHelper = async (
  userId: string,
  adminId: string,
  reason: string,
) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const previousStatus = user.helperApplicationStatus || "pending";

  // 1. Blacklist Auth and User
  await AuthRepository.updateById(String(user.auth), {
    isBlacklisted: true,
    isBlocked: true,
    blacklistedReason: reason,
    blacklistedAt: new Date(),
  });

  await UserRepository.updateById(userId, {
    isBlocked: true,
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
      { upsert: true, new: true },
    );
  }

  // 3. Sever active socket connections
  disconnectUserSockets(userId);

  // 4. Invalidate cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return { success: true, message: "User and identity document permanently blacklisted" };
};

// ─── Unban Helper ────────────────────────────────────────
const unbanHelper = async (
  userId: string,
  adminId: string,
  reason?: string,
) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // 1. Unblock Auth and User
  await AuthRepository.updateById(String(user.auth), {
    isBlacklisted: false,
    isBlocked: false,
    blacklistedReason: undefined,
    blacklistedAt: undefined,
  });

  await UserRepository.updateById(userId, {
    isBlocked: false,
    appealStatus: "none",
    appealCount: 0,
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
  });

  // 2. Safe null-check removal from BlacklistedDocument
  if (user.documentNumberHash) {
    await BlacklistedDocument.deleteOne({
      documentHash: user.documentNumberHash,
    });
  }

  // 3. Invalidate cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return { success: true, message: "User and identity document unbanned successfully" };
};

// ─── Block User (Toggle) ─────────────────────────────────
const blockUser = async (userId: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const updatedUser = await UserRepository.updateById(userId, {
    isBlocked: !user.isBlocked,
  });

  if (updatedUser?.isBlocked) {
    disconnectUserSockets(userId);
  }

  // Invalidate cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return updatedUser;
};

// ─── Get Stats ───────────────────────────────────────────
const getStats = async () => {
  const { Job } = await import("module/job/job.model");
  const { PaymentTransaction } = await import("module/payment/payment.model");
  const { PaymentStatus } = await import("module/payment/payment.interface");

  const [
    totalUsers,
    totalHelpers,
    pendingApplications,
    approvedHelpers,
    rejectedHelpers,
    pendingAppeals,
    totalBookings,
    pendingJobs,
    completedPayments,
  ] = await Promise.all([
    UserRepository.count({ isDeleted: false }),
    UserRepository.count({ isHelperFormSubmitted: true }),
    UserRepository.count({
      isHelperFormSubmitted: true,
      helperApplicationStatus: HelperApplicationStatus.PENDING,
    }),
    UserRepository.count({
      isHelperFormSubmitted: true,
      helperApplicationStatus: HelperApplicationStatus.APPROVED,
    }),
    UserRepository.count({
      isHelperFormSubmitted: true,
      helperApplicationStatus: HelperApplicationStatus.REJECTED,
    }),
    UserRepository.count({
      isHelperFormSubmitted: true,
      helperApplicationStatus: HelperApplicationStatus.PENDING_APPEAL,
    }),
    Job.countDocuments({}),
    Job.countDocuments({ status: JobStatus.OPEN }),
    PaymentTransaction.aggregate([
      { $match: { status: PaymentStatus.COMPLETED } },
      { $group: { _id: null, totalVolume: { $sum: "$amount" } } },
    ]),
  ]);

  const grossVolume = completedPayments[0]?.totalVolume || 0;
  const platformEarnings = Math.round(grossVolume * 0.20);

  return {
    totalUsers,
    totalHelpers,
    pendingApplications,
    approvedHelpers,
    rejectedHelpers,
    pendingAppeals,
    totalBookings,
    activeWorkers: approvedHelpers,
    pendingJobs,
    platformEarnings,
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
    permissions: auth?.permissions || ["*"],
    status: auth?.status,
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
    updates.phone = payload.phone;
  }
  if (payload.avatar !== undefined) {
    updates.avatar = payload.avatar || "";
  }

  if (Object.keys(updates).length) {
    await UserRepository.updateById(userId, updates);
  }

  return getAdminProfile(userId);
};

// ─── List Staff ──────────────────────────────────────────
const getStaffList = async (page: number = 1, limit: number = 20, search?: string) => {
  const adminRoles = [AuthRole.ADMIN, "staff" as AuthRole];
  const authRecords = await AuthRepository.findMany(
    { role: { $in: adminRoles }, isDeleted: false },
    { select: "email role status isSuperAdmin permissions createdAt" },
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
      permissions: auth?.permissions || ["*"],
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

  return { docs, total, page, limit };
};

// ─── Create Staff ────────────────────────────────────────
const createStaff = async (payload: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  permissions?: string[];
}) => {
  const { name, email, phone, password, permissions = ["*"] } = payload;

  // Check if email already in use
  const existing = await AuthRepository.findOne({ email, isDeleted: false });
  if (existing) {
    throw new AppError(StatusCodes.CONFLICT, "An account with this email already exists");
  }

  // Create auth record — auto-verified, immediately active
  const auth = await AuthRepository.create({
    email,
    password, // hashed by pre-save hook
    loginProvider: AuthProvider.EMAIL,
    role: AuthRole.STAFF,
    status: AuthStatus.ACTIVE,
    isEmailVerified: true,
    permissions,
  } as any);

  // Create linked user record
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
    createdAt: (user as any).createdAt,
  };
};

// ─── Update Staff ────────────────────────────────────────
const updateStaff = async (
  staffUserId: string,
  updates: { permissions?: string[]; status?: string; name?: string; phone?: string },
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
  if (updates.permissions !== undefined) authUpdates.permissions = updates.permissions;
  if (updates.status !== undefined) authUpdates.status = updates.status;

  if (Object.keys(authUpdates).length > 0) {
    await AuthRepository.updateById(String(auth._id), authUpdates);
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

  await AuthRepository.updateById(String(auth._id), { isDeleted: true });
  await UserRepository.updateById(staffUserId, { isDeleted: true } as any);

  return { message: "Staff member removed successfully" };
};

// ─── Helper Job History ──────────────────────────────────────
const getHelperJobs = async (userId: string, page: number = 1, limit: number = 10) => {
  const { JobRepository } = await import("../job/job.repository");
  const filter = { assignedTo: new Types.ObjectId(userId) };
  return JobRepository.findAll(filter, { page, limit });
};

// ─── User Booking History ────────────────────────────────────
const getUserBookings = async (userId: string, page: number = 1, limit: number = 10) => {
  const { JobRepository } = await import("../job/job.repository");
  const filter = { postedBy: new Types.ObjectId(userId) };
  return JobRepository.findAll(filter, { page, limit });
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
};
