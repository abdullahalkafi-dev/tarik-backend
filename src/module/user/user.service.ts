import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { UserRepository } from "./user.repository";
import { AuthRepository } from "module/auth/auth.repository";
import { HelperApplicationStatus } from "./user.interface";
import cacheService from "redis/cacheService";
import { buildCacheKey } from "redis/cache.utils";
import { resolveUrl } from "util/minio";
import { logger } from "logger/logger";

// ─── Get Me (dynamic based on role) ────────────────────
const getMe = async (userId: string) => {
  const user = await UserRepository.findById(userId, {
    populate: "serviceType",
  });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const auth = await AuthRepository.findById(String(user.auth));
  if (!auth) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  return {
    _id: user._id,
    name: user.name,
    email: user.email || null,
    phone: user.phone,
    avatar: resolveUrl(user.avatar),
    coverPhoto: resolveUrl(user.coverPhoto),
    bio: user.bio,
    role: auth.role,
    status: auth.status,
    location: user.location,
    address: user.address,
    // Helper fields
    isHelperFormSubmitted: user.isHelperFormSubmitted,
    helperApplicationStatus: user.helperApplicationStatus,
    rejectionReason: user.rejectionReason,
    applicationHistory: user.applicationHistory || [],
    age: user.age,
    city: user.city,
    language: user.language,
    serviceType: user.serviceType,
    pricePerHour: user.pricePerHour,
    experience: user.experience,
    serviceRadius: user.serviceRadius,
    profilePhotos: user.profilePhotos?.map(resolveUrl).filter(Boolean) as string[],
    documentType: user.documentType,
    documentUrl: resolveUrl(user.documentUrl),
    selfieUrl: resolveUrl(user.selfieUrl),
    // Didit fields
    diditSessionId: user.diditSessionId,
    diditStatus: user.diditStatus,
    diditDecisionReason: user.diditDecisionReason,
    diditDiagnostics: user.diditDiagnostics,
    maskedDocumentNumber: user.maskedDocumentNumber,
    // Appeal fields
    appealStatus: user.appealStatus || "none",
    appealCount: user.appealCount || 0,
    appealMessage: user.appealMessage,
    appealedAt: user.appealedAt,
  };
};

// ─── Update Profile ─────────────────────────────────────
const updateProfile = async (
  userId: string,
  payload: {
    name?: string;
    bio?: string;
    phone?: string;
    email?: string;
    address?: string;
    avatar?: string;
    age?: number;
    city?: string;
    language?: string;
    serviceType?: string;
    pricePerHour?: number;
    experience?: number;
    serviceRadius?: number;
    profilePhotos?: string[];
    longitude?: number;
    latitude?: number;
  },
) => {
  const { longitude, latitude, profilePhotos, email: emailPayload, ...rest } = payload;
  // Empty email means "leave unchanged" — email is optional for clients.
  const email = emailPayload && String(emailPayload).trim() !== ""
    ? String(emailPayload).trim()
    : undefined;
  const updateData: Record<string, any> = { ...rest };
  if (email) {
    updateData.email = email;
  }

  if (profilePhotos && Array.isArray(profilePhotos)) {
    // If incoming photos contain full URLs (e.g. from existing profile state), strip back to key
    updateData.profilePhotos = profilePhotos.map((photo) => {
      if (photo.includes("/images/")) {
        const idx = photo.indexOf("images/");
        return photo.substring(idx);
      }
      return photo;
    });
  }

  if (typeof longitude === "number" && typeof latitude === "number") {
    updateData.location = {
      type: "Point",
      coordinates: [longitude, latitude],
    };
  }

  const existingUser = await UserRepository.findById(userId);
  if (!existingUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // Email must be unique across auth accounts
  if (email && existingUser.auth) {
    const normalizedEmail = email.toLowerCase();
    const existing = await AuthRepository.findOne({ email: normalizedEmail }) as any;
    if (existing && String(existing._id) !== String(existingUser.auth)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "This email is already registered",
      );
    }
  }

  // Phone is unique — block changing it via profile update
  if (payload.phone != null && existingUser.phone && payload.phone !== existingUser.phone) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Phone number cannot be changed",
    );
  }

  const updatedUser = await UserRepository.updateById(userId, updateData);
  if (!updatedUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  if (email && updatedUser.auth) {
    await AuthRepository.updateById(String(updatedUser.auth), {
      email: email.toLowerCase(),
    });
  }

  // Invalidate cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return updatedUser;
};

// ─── Update Location ────────────────────────────────────
const updateLocation = async (
  userId: string,
  payload: { longitude: number; latitude: number; address?: string },
) => {
  const user = await UserRepository.updateById(userId, {
    location: {
      type: "Point",
      coordinates: [payload.longitude, payload.latitude],
    },
    address: payload.address,
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  return user;
};

// ─── Helper Apply ───────────────────────────────────────
type THelperApplyPayload = {
  age: number;
  city: string;
  language: string;
  serviceType: string;
  pricePerHour: number;
  experience: number;
  serviceRadius: number;
  profilePhotos?: string[];
  documentType?: string;
  documentUrl?: string;
  selfieUrl?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  bio?: string;
};

const helperApply = async (userId: string, payload: THelperApplyPayload) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // Check if already approved
  if (user.helperApplicationStatus === HelperApplicationStatus.APPROVED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Application already approved");
  }

  // Check if already pending or appeal pending
  if (
    user.helperApplicationStatus === HelperApplicationStatus.PENDING ||
    user.helperApplicationStatus === HelperApplicationStatus.PENDING_APPEAL
  ) {
    // If user is just re-submitting profile information before completing KYC, allow update
  }

  // Check if document is blacklisted
  if (user.documentNumberHash) {
    const { BlacklistedDocument } = await import("../admin/blacklistedDocument.model");
    const isBlacklisted = await BlacklistedDocument.findOne({
      documentHash: user.documentNumberHash,
    });
    if (isBlacklisted) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "This identity document is blacklisted due to security policy violations.",
      );
    }
  }

  if (user.isBlocked) {
    throw new AppError(StatusCodes.FORBIDDEN, "Account has been suspended.");
  }

  // Check location is set
  if (!user.location || !user.location.coordinates) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Please set your location first");
  }

  // Build history entry
  const historyEntry = {
    appliedAt: new Date(),
    status: HelperApplicationStatus.PENDING,
  };

  const updatedUser = await UserRepository.updateById(userId, {
    $set: {
      isHelperFormSubmitted: true,
      helperApplicationStatus: user.helperApplicationStatus || HelperApplicationStatus.PENDING,
      rejectionReason: null,
      age: payload.age,
      city: payload.city,
      language: payload.language,
      serviceType: payload.serviceType,
      pricePerHour: payload.pricePerHour,
      experience: payload.experience,
      serviceRadius: payload.serviceRadius,
      profilePhotos: payload.profilePhotos,
      documentType: payload.documentType,
      documentUrl: payload.documentUrl,
      selfieUrl: payload.selfieUrl,
      phone: payload.phone || user.phone,
      ...(payload.email && { email: payload.email }),
      ...(payload.bio && { bio: payload.bio }),
      ...(payload.avatar && { avatar: payload.avatar }),
    },
    $push: { applicationHistory: historyEntry },
  });

  if (payload.email && user.auth) {
    await AuthRepository.updateById(String(user.auth), { email: payload.email });
  }

  // Invalidate cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return updatedUser;
};

// ─── Get Application Status ─────────────────────────────
const getApplicationStatus = async (userId: string) => {
  const user = await UserRepository.findById(userId, {
    select: "isHelperFormSubmitted helperApplicationStatus rejectionReason name email",
  });

  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  return {
    isHelperFormSubmitted: user.isHelperFormSubmitted,
    helperApplicationStatus: user.helperApplicationStatus,
    rejectionReason: user.rejectionReason,
  };
};

// ─── Search Helpers (for home + find-helper) ─────────────
type THelperSearchQuery = {
  category?: string;
  maxDistance?: number;
  minRating?: number;
  latitude?: number;
  longitude?: number;
  page?: number;
  limit?: number;
};

const searchHelpers = async (query: THelperSearchQuery) => {
  const filter: any = {
    isHelperFormSubmitted: true,
    helperApplicationStatus: HelperApplicationStatus.APPROVED,
    isBlocked: false,
    isDeleted: false,
  };

  if (query.category) {
    filter.serviceType = query.category;
  }

  // If coordinates provided, use geo query
  const hasGeo = query.latitude != null && query.longitude != null;
  if (hasGeo) {
    const maxDist = query.maxDistance || 10000; // default 10km
    filter.location = {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [query.longitude!, query.latitude!],
        },
        $maxDistance: maxDist,
      },
    };
  }

  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  // $near can't be used in countDocuments (MongoDB 5.1+ aggregation restriction).
  // Build a separate count filter using $geoWithin when geo query is active.
  const countFilter = hasGeo
    ? {
        ...filter,
        location: {
          $geoWithin: {
            $centerSphere: [
              [query.longitude!, query.latitude!],
              (query.maxDistance || 10000) / 6378100,
            ],
          },
        },
      }
    : filter;

  const [helpers, total] = await Promise.all([
    UserRepository.findMany(filter, {
      select:
        "name avatar address location pricePerHour experience serviceRadius bio city language serviceType rating reviewCount",
      // $near already sorts by distance — skip explicit sort for geo queries
      ...(hasGeo ? {} : { sort: { createdAt: -1 } }),
      skip,
      limit,
      populate: "serviceType",
    }),
    UserRepository.count(countFilter),
  ]);

  // Resolve avatar keys to full URLs
  const resolvedHelpers = helpers.map((h: any) => ({
    ...h.toObject(),
    avatar: resolveUrl(h.avatar),
  }));

  return {
    helpers: resolvedHelpers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// ─── Get Helper Profile (public) ─────────────────────
const getHelperProfile = async (userId: string) => {
  const user = await UserRepository.findById(userId, {
    select:
      "name avatar bio serviceType pricePerHour experience serviceRadius address city language profilePhotos createdAt isHelperFormSubmitted helperApplicationStatus",
    populate: "serviceType",
  });

  if (
    !user ||
    !user.isHelperFormSubmitted ||
    user.helperApplicationStatus !== HelperApplicationStatus.APPROVED
  ) {
    throw new AppError(StatusCodes.NOT_FOUND, "Helper not found");
  }

  return {
    _id: user._id,
    name: user.name,
    avatar: resolveUrl(user.avatar),
    bio: user.bio,
    serviceType: user.serviceType,
    pricePerHour: user.pricePerHour,
    experience: user.experience,
    serviceRadius: user.serviceRadius,
    address: user.address,
    city: user.city,
    language: user.language,
    profilePhotos: user.profilePhotos
      ?.map(resolveUrl)
      .filter(Boolean) as string[],
    createdAt: user.createdAt,
  };
};

// ─── Submit Appeal ──────────────────────────────────────
const submitAppeal = async (userId: string, message: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // 1. Check if document is blacklisted
  if (user.documentNumberHash) {
    const { BlacklistedDocument } = await import("../admin/blacklistedDocument.model");
    const isBlacklisted = await BlacklistedDocument.findOne({
      documentHash: user.documentNumberHash,
    });
    if (isBlacklisted) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "This identity document / profile has been flagged due to security policy violations. Appeals are locked.",
      );
    }
  }

  if (user.isBlocked) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Account has been permanently suspended. Appeals are unavailable.",
    );
  }

  if (user.appealCount >= 3 || user.appealStatus === "max_exceeded") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Maximum appeal attempts exceeded (3 max). Please contact support for assistance.",
    );
  }

  const updatedUser = await UserRepository.updateById(userId, {
    appealStatus: "pending",
    appealMessage: message,
    appealedAt: new Date(),
    helperApplicationStatus: HelperApplicationStatus.PENDING_APPEAL,
    $inc: { appealCount: 1 },
    $push: {
      adminActionHistory: {
        action: "HELPER_SUBMITTED_APPEAL",
        adminId: user.auth,
        reason: message,
        previousStatus: user.helperApplicationStatus || "rejected",
        newStatus: "pending_appeal",
        timestamp: new Date(),
      },
    },
  });

  // Purge user cache
  await cacheService.deleteCache(buildCacheKey("user", "me", userId));

  return updatedUser;
};

// ─── FCM Device Token ───────────────────────────────────
const registerDeviceToken = async (
  userId: string,
  payload: { token: string; platform?: "android" | "ios" },
) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // Strip this token from any other account (account switch / shared device)
  await UserRepository.clearDeviceTokenFromOthers(userId, payload.token);

  await UserRepository.updateById(userId, {
    deviceToken: payload.token,
    deviceTokenPlatform: payload.platform || "android",
    deviceTokenUpdatedAt: new Date(),
  });

  logger.info("[FCM] device token registered", {
    userId,
    platform: payload.platform || "android",
    tokenPreview: String(payload.token).slice(0, 16) + "...",
  });

  return { registered: true };
};

const clearDeviceToken = async (userId: string) => {
  await UserRepository.updateById(userId, {
    deviceToken: null,
    deviceTokenUpdatedAt: new Date(),
  });
  logger.info("[FCM] device token cleared", { userId });
  return { cleared: true };
};

export const UserService = {
  getMe,
  updateProfile,
  updateLocation,
  helperApply,
  getApplicationStatus,
  searchHelpers,
  getHelperProfile,
  submitAppeal,
  registerDeviceToken,
  clearDeviceToken,
};
