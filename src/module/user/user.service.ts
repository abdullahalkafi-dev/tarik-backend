import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import AppError from "errors/AppError";
import { UserRepository } from "./user.repository";
import { User } from "./user.model";
import { AuthRepository } from "module/auth/auth.repository";
import { revokeAllSessions } from "module/auth/auth.service";
import { HelperApplicationStatus } from "./user.interface";
import { CategoryService } from "module/category/category.service";
import { CategoryRepository } from "module/category/category.repository";
import cacheService from "redis/cacheService";
import { buildCacheKey } from "redis/cache.utils";
import { resolveUrl, deleteFromMinio } from "util/minio";
import { logger } from "logger/logger";
import { approximateAddress, haversineKm, roundKm } from "util/geo";
import { assertOwnUploadKey, assertOwnUploadKeys, toStorageKey } from "util/uploadKey";
import { disconnectUserSockets } from "../../socket/socket.gateway";

const STAFF_ROLES = ["admin", "staff", "superAdmin"];
const MAX_DEVICES = 5;

const invalidateMe = (userId: string) =>
  cacheService.deleteCache(buildCacheKey("user", "me", userId));

/**
 * If the identity check already passed and only the profile was missing, a
 * completed profile approves the helper now (fire and forget).
 */
const reevaluateKyc = (userId: string) => {
  import("module/didit/didit.service")
    .then(({ DiditService }) => DiditService.reevaluateAfterProfile(userId))
    .catch((err) => logger.warn(`[KYC] re-evaluation failed for ${userId}: ${err}`));
};

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
    locale: user.locale || "fr",
    isAvailable: user.isAvailable !== false,
    notificationPrefs: {
      push: user.notificationPrefs?.push !== false,
      sound: user.notificationPrefs?.sound !== false,
      vibrate: user.notificationPrefs?.vibrate !== false,
      payments: user.notificationPrefs?.payments !== false,
      appUpdates: user.notificationPrefs?.appUpdates !== false,
      newService: user.notificationPrefs?.newService !== false,
    },
    acceptedLegalVersion: user.acceptedLegalVersion ?? null,
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
    cancelStrikes: user.cancelStrikes || 0,
  };
};

type TProfilePayload = {
  name?: string;
  bio?: string;
  phone?: string;
  email?: string;
  address?: string;
  avatar?: string;
  age?: number;
  city?: string;
  language?: string;
  locale?: string;
  serviceType?: string;
  pricePerHour?: number;
  experience?: number;
  serviceRadius?: number;
  profilePhotos?: string[];
  longitude?: number;
  latitude?: number;
  notificationPrefs?: Record<string, boolean>;
  isAvailable?: boolean;
};

const assertEmailFree = async (email: string, ownAuthId?: unknown) => {
  const existing = (await AuthRepository.findOne({
    email: email.toLowerCase(),
    isDeleted: false,
  })) as any;
  if (existing && String(existing._id) !== String(ownAuthId)) {
    throw new AppError(StatusCodes.CONFLICT, "This email is already registered", {
      code: "EMAIL_TAKEN",
    });
  }
  const otherUser = await User.exists({
    email: email.toLowerCase(),
    isDeleted: { $ne: true },
    auth: { $ne: ownAuthId },
  } as any);
  if (otherUser) {
    throw new AppError(StatusCodes.CONFLICT, "This email is already registered", {
      code: "EMAIL_TAKEN",
    });
  }
};

const assertCategory = async (categoryId: string) => {
  if (!Types.ObjectId.isValid(categoryId)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Service category not found", {
      code: "CATEGORY_NOT_FOUND",
    });
  }
  const category = await CategoryRepository.findById(categoryId);
  if (!category || category.isActive === false) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Service category not found", {
      code: "CATEGORY_NOT_FOUND",
    });
  }
};

const lockedError = (field: string) =>
  new AppError(
    StatusCodes.FORBIDDEN,
    "This information was verified and can only be changed by support",
    { code: "PROFILE_FIELD_LOCKED", params: { field } },
  );

// ─── Update Profile ─────────────────────────────────────
const updateProfile = async (userId: string, payload: TProfilePayload) => {
  const existingUser = await UserRepository.findById(userId);
  if (!existingUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const status = existingUser.helperApplicationStatus;
  const isApproved = status === HelperApplicationStatus.APPROVED;
  const isUnderAppeal = status === HelperApplicationStatus.PENDING_APPEAL;

  // After KYC approval identity-bound data is frozen; during an appeal the
  // whole helper form is frozen (it is being reviewed).
  if (isApproved) {
    if (payload.name !== undefined && payload.name !== existingUser.name) throw lockedError("name");
    if (payload.age !== undefined && payload.age !== existingUser.age) throw lockedError("age");
    if (
      payload.serviceType !== undefined &&
      String(payload.serviceType) !== String(existingUser.serviceType || "")
    ) {
      throw lockedError("serviceType");
    }
  }
  if (isUnderAppeal) {
    const helperFields = ["age", "city", "language", "serviceType", "pricePerHour", "experience", "serviceRadius", "profilePhotos"] as const;
    if (helperFields.some((f) => payload[f] !== undefined)) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Your application is under review and cannot be edited right now",
        { code: "APPLICATION_LOCKED" },
      );
    }
  }

  const {
    longitude,
    latitude,
    profilePhotos,
    email: emailPayload,
    notificationPrefs,
    avatar,
    ...rest
  } = payload;

  const updateData: Record<string, any> = { ...rest };
  // Name / phone-like identity fields are only touched when they changed.
  if (updateData.name !== undefined) updateData.name = updateData.name.trim();

  // Email: optional contact detail, must be unique, stored lower-case.
  const email = emailPayload && String(emailPayload).trim() !== ""
    ? String(emailPayload).trim().toLowerCase()
    : undefined;
  if (email && email !== (existingUser.email || "").toLowerCase()) {
    await assertEmailFree(email, existingUser.auth);
    updateData.email = email;
  }

  // Phone is unique and verified by OTP — never editable here.
  if (payload.phone != null && existingUser.phone && payload.phone !== existingUser.phone) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Phone number cannot be changed", {
      code: "PHONE_IMMUTABLE",
    });
  }
  delete updateData.phone;

  // Files must be our own uploads (no external URLs, no other users' files).
  if (avatar !== undefined) {
    updateData.avatar = avatar
      ? assertOwnUploadKey(avatar, userId, {
          allowed: [existingUser.avatar || ""],
          kinds: ["images"],
        })
      : "";
  }
  if (profilePhotos && Array.isArray(profilePhotos)) {
    updateData.profilePhotos = assertOwnUploadKeys(profilePhotos, userId, {
      allowed: existingUser.profilePhotos || [],
      kinds: ["images"],
    });
  }

  if (typeof longitude === "number" && typeof latitude === "number") {
    updateData.location = {
      type: "Point",
      coordinates: [longitude, latitude],
    };
  }

  if (notificationPrefs) {
    for (const [k, v] of Object.entries(notificationPrefs)) {
      updateData[`notificationPrefs.${k}`] = v;
    }
  }

  if (payload.serviceType !== undefined) {
    await assertCategory(payload.serviceType);
  }
  if (payload.pricePerHour != null || payload.serviceType != null) {
    await CategoryService.assertMinHourlyRate(
      payload.serviceType ?? existingUser.serviceType,
      payload.pricePerHour ?? existingUser.pricePerHour,
    );
  }

  const updatedUser = await UserRepository.updateById(userId, updateData);
  if (!updatedUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  if (updateData.email && updatedUser.auth) {
    await AuthRepository.updateById(String(updatedUser.auth), { email: updateData.email });
  }

  await invalidateMe(userId);
  reevaluateKyc(userId);

  // Never echo internal review data back to the client.
  const obj: any = updatedUser.toObject();
  delete obj.adminActionHistory;
  delete obj.documentNumberHash;
  delete obj.deviceTokens;
  delete obj.deviceToken;
  obj.avatar = resolveUrl(obj.avatar);
  obj.profilePhotos = (obj.profilePhotos || []).map(resolveUrl).filter(Boolean);
  obj.documentUrl = resolveUrl(obj.documentUrl);
  obj.selfieUrl = resolveUrl(obj.selfieUrl);
  return obj;
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

  await invalidateMe(userId);
  return user;
};

// ─── Availability ("on duty" switch) ────────────────────
const setAvailability = async (userId: string, isAvailable: boolean) => {
  const user = await UserRepository.findById(userId);
  if (!user) throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  if (user.helperApplicationStatus !== HelperApplicationStatus.APPROVED) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only approved helpers can change availability", {
      code: "NOT_A_HELPER",
    });
  }
  await UserRepository.updateById(userId, { isAvailable });
  if (!isAvailable) {
    // Off duty: stop being shown on the live map right away.
    const { SocketTrackingService } = await import("../../socket/socket.tracking");
    await SocketTrackingService.removeHelper(userId);
  }
  await invalidateMe(userId);
  return { isAvailable };
};

// ─── Terms / privacy acceptance ────────────────────────
const acceptLegal = async (userId: string, version: number) => {
  await UserRepository.updateById(userId, {
    acceptedLegalVersion: version,
    acceptedLegalAt: new Date(),
  });
  await invalidateMe(userId);
  return { acceptedLegalVersion: version };
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

  const status = user.helperApplicationStatus;

  if (status === HelperApplicationStatus.APPROVED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Application already approved", {
      code: "ALREADY_APPROVED",
    });
  }
  if (status === HelperApplicationStatus.PENDING_APPEAL) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Your appeal is being reviewed. You cannot change the application now.",
      { code: "APPLICATION_LOCKED" },
    );
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
    throw new AppError(StatusCodes.BAD_REQUEST, "Please set your location first", {
      code: "LOCATION_REQUIRED",
    });
  }

  await assertCategory(payload.serviceType);
  await CategoryService.assertMinHourlyRate(payload.serviceType, payload.pricePerHour);

  const email = payload.email ? payload.email.trim().toLowerCase() : undefined;
  if (email && email !== (user.email || "").toLowerCase()) {
    await assertEmailFree(email, user.auth);
  }

  // Own uploads only. KYC documents live in the private `documents/` area.
  const photos = payload.profilePhotos
    ? assertOwnUploadKeys(payload.profilePhotos, userId, {
        allowed: user.profilePhotos || [],
        kinds: ["images"],
      })
    : undefined;
  const documentUrl = payload.documentUrl
    ? assertOwnUploadKey(payload.documentUrl, userId, {
        allowed: [user.documentUrl || ""],
        kinds: ["documents", "images"],
      })
    : undefined;
  const selfieUrl = payload.selfieUrl
    ? assertOwnUploadKey(payload.selfieUrl, userId, {
        allowed: [user.selfieUrl || ""],
        kinds: ["documents", "images"],
      })
    : undefined;
  const avatar = payload.avatar
    ? assertOwnUploadKey(payload.avatar, userId, {
        allowed: [user.avatar || ""],
        kinds: ["images"],
      })
    : undefined;

  // One history row per real transition (null -> pending, rejected -> pending),
  // not one per save of the form.
  const movesToPending = !status || status === HelperApplicationStatus.REJECTED;

  const set: Record<string, any> = {
    isHelperFormSubmitted: true,
    helperApplicationStatus: movesToPending ? HelperApplicationStatus.PENDING : status,
    age: payload.age,
    city: payload.city,
    language: payload.language,
    serviceType: payload.serviceType,
    pricePerHour: payload.pricePerHour,
    experience: payload.experience,
    serviceRadius: payload.serviceRadius,
    ...(photos && { profilePhotos: photos }),
    ...(payload.documentType && { documentType: payload.documentType }),
    ...(documentUrl && { documentUrl }),
    ...(selfieUrl && { selfieUrl }),
    ...(email && { email }),
    ...(payload.bio && { bio: payload.bio }),
    ...(avatar && { avatar }),
  };
  if (movesToPending) set.rejectionReason = null;

  const update: Record<string, any> = { $set: set };
  if (movesToPending) {
    update.$push = {
      applicationHistory: { appliedAt: new Date(), status: HelperApplicationStatus.PENDING },
    };
  }

  const updatedUser = await UserRepository.updateById(userId, update);

  if (email && user.auth) {
    await AuthRepository.updateById(String(user.auth), { email });
  }

  await invalidateMe(userId);
  reevaluateKyc(userId);

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
  maxPrice?: number;
  sort?: "nearest" | "rating" | "price_low" | "price_high";
  search?: string;
  latitude?: number;
  longitude?: number;
  page?: number;
  limit?: number;
};

const DEFAULT_SEARCH_RADIUS_M = 10_000;
const MAX_SEARCH_RADIUS_M = 100_000;
const DEFAULT_HELPER_RADIUS_KM = 15;

/** Fields needed to render a helper card (no home address, no exact coordinates). */
const HELPER_CARD_PROJECTION = {
  name: 1,
  avatar: 1,
  pricePerHour: 1,
  experience: 1,
  serviceRadius: 1,
  bio: 1,
  city: 1,
  address: 1,
  language: 1,
  serviceType: 1,
  rating: 1,
  reviewCount: 1,
  profilePhotos: 1,
  helperApplicationStatus: 1,
  diditStatus: 1,
  documentUrl: 1,
  isAvailable: 1,
  distanceMeters: 1,
};

/** Approved helper whose identity passed automated KYC or a manual document review. */
const isIdentityVerified = (u: any): boolean =>
  u?.helperApplicationStatus === HelperApplicationStatus.APPROVED &&
  (String(u?.diditStatus || "").toLowerCase() === "approved" || !!u?.documentUrl);

const resolvePhotos = (photos?: string[]): string[] =>
  (photos || []).map(resolveUrl).filter(Boolean) as string[];

/** "Casablanca" - never the helper's street address. */
const publicArea = (obj: any): string =>
  (obj.city && String(obj.city).trim()) || approximateAddress(obj.address) || "";

const toHelperCard = (h: any) => {
  const obj = typeof h?.toObject === "function" ? h.toObject() : { ...h };
  const isVerified = isIdentityVerified(obj);
  const workPhotos = resolvePhotos(obj.profilePhotos).slice(0, 3);
  const area = publicArea(obj);
  const distanceKm =
    typeof obj.distanceMeters === "number" ? roundKm(obj.distanceMeters / 1000) : undefined;

  delete obj.diditStatus;
  delete obj.documentUrl;
  delete obj.helperApplicationStatus;
  delete obj.profilePhotos;
  delete obj.location;
  delete obj.distanceMeters;

  return {
    ...obj,
    // `address` is kept in the payload for older app builds but only ever holds the area.
    address: area,
    area,
    ...(distanceKm !== undefined ? { distanceKm } : {}),
    avatar: resolveUrl(obj.avatar),
    isVerified,
    workPhotos,
    rating: Number(obj.rating) || 0,
    reviewCount: Number(obj.reviewCount) || 0,
    isAvailable: obj.isAvailable !== false,
  };
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const searchHelpers = async (query: THelperSearchQuery) => {
  const match: any = {
    isHelperFormSubmitted: true,
    helperApplicationStatus: HelperApplicationStatus.APPROVED,
    isBlocked: false,
    isDeleted: false,
    // Helpers who switched themselves off duty are not offered to clients.
    isAvailable: { $ne: false },
  };

  if (query.category) {
    if (!Types.ObjectId.isValid(query.category)) {
      return { helpers: [], total: 0, page: 1, limit: query.limit || 20, totalPages: 0 };
    }
    match.serviceType = new Types.ObjectId(query.category);
  }
  if (query.minRating) match.rating = { $gte: query.minRating };
  if (query.maxPrice) match.pricePerHour = { $lte: query.maxPrice };
  if (query.search) match.name = { $regex: escapeRegex(query.search), $options: "i" };

  const hasGeo = query.latitude != null && query.longitude != null;
  const page = Math.max(query.page || 1, 1);
  const limit = Math.min(Math.max(query.limit || 20, 1), 50);
  const skip = (page - 1) * limit;
  const searchRadiusM = Math.min(query.maxDistance || DEFAULT_SEARCH_RADIUS_M, MAX_SEARCH_RADIUS_M);

  const sortStage: Record<string, 1 | -1> =
    query.sort === "rating"
      ? { rating: -1, reviewCount: -1, ...(hasGeo ? { distanceMeters: 1 } : { createdAt: -1 }) }
      : query.sort === "price_low"
        ? { pricePerHour: 1, rating: -1 }
        : query.sort === "price_high"
          ? { pricePerHour: -1, rating: -1 }
          : hasGeo
            ? { distanceMeters: 1, rating: -1 }
            : { rating: -1, createdAt: -1 };

  const pipeline: any[] = [];
  if (hasGeo) {
    pipeline.push({
      $geoNear: {
        near: { type: "Point", coordinates: [query.longitude, query.latitude] },
        distanceField: "distanceMeters",
        maxDistance: searchRadiusM,
        spherical: true,
        query: match,
        key: "location",
      },
    });
    // A helper only works within their own radius, whatever the client asked for.
    pipeline.push({
      $match: {
        $expr: {
          $lte: [
            "$distanceMeters",
            { $multiply: [{ $ifNull: ["$serviceRadius", DEFAULT_HELPER_RADIUS_KM] }, 1000] },
          ],
        },
      },
    });
  } else {
    pipeline.push({ $match: match });
  }
  pipeline.push(
    { $sort: sortStage },
    {
      $facet: {
        docs: [{ $skip: skip }, { $limit: limit }, { $project: HELPER_CARD_PROJECTION }],
        total: [{ $count: "n" }],
      },
    },
  );

  const [facet] = await User.aggregate(pipeline).exec();
  const docs: any[] = facet?.docs || [];
  const total: number = facet?.total?.[0]?.n || 0;

  const populated = await User.populate(docs, {
    path: "serviceType",
    select: "name slug names icon minHourlyRate",
  });

  return {
    helpers: populated.map(toHelperCard),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    // Nobody nearby: the app offers "widen the distance" / "post a job" instead
    // of showing helpers from the other end of the country.
    expandRadiusSuggested: hasGeo && total === 0 && searchRadiusM < MAX_SEARCH_RADIUS_M,
    searchRadiusKm: hasGeo ? Math.round(searchRadiusM / 1000) : null,
  };
};

// ─── Get Helper Profile (public) ─────────────────────
const getHelperProfile = async (
  userId: string,
  viewer?: { latitude?: number; longitude?: number },
) => {
  const user = await UserRepository.findById(userId, {
    select:
      "name avatar bio serviceType pricePerHour experience serviceRadius address city language profilePhotos createdAt isHelperFormSubmitted helperApplicationStatus diditStatus documentUrl rating reviewCount isAvailable location isBlocked isDeleted",
    populate: "serviceType",
  });

  if (
    !user ||
    user.isBlocked ||
    user.isDeleted ||
    !user.isHelperFormSubmitted ||
    user.helperApplicationStatus !== HelperApplicationStatus.APPROVED
  ) {
    throw new AppError(StatusCodes.NOT_FOUND, "Helper not found");
  }

  let distanceKm: number | undefined;
  const coords = user.location?.coordinates;
  if (
    viewer?.latitude != null &&
    viewer?.longitude != null &&
    Array.isArray(coords) &&
    coords.length >= 2
  ) {
    distanceKm = roundKm(haversineKm(viewer.latitude, viewer.longitude, coords[1], coords[0]));
  }

  const area = publicArea(user);

  return {
    _id: user._id,
    name: user.name,
    avatar: resolveUrl(user.avatar),
    bio: user.bio,
    serviceType: user.serviceType,
    pricePerHour: user.pricePerHour,
    experience: user.experience,
    serviceRadius: user.serviceRadius,
    address: area,
    area,
    city: user.city,
    language: user.language,
    profilePhotos: resolvePhotos(user.profilePhotos),
    rating: Number(user.rating) || 0,
    reviewCount: Number(user.reviewCount) || 0,
    isVerified: isIdentityVerified(user),
    isAvailable: user.isAvailable !== false,
    ...(distanceKm !== undefined ? { distanceKm } : {}),
    createdAt: user.createdAt,
  };
};

// ─── Submit Appeal ──────────────────────────────────────
const submitAppeal = async (userId: string, message: string) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  // Only a rejected applicant can appeal (an approved helper or a plain client cannot).
  if (user.helperApplicationStatus !== HelperApplicationStatus.REJECTED) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Only a rejected application can be appealed",
      { code: "APPEAL_NOT_ALLOWED" },
    );
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
      { code: "APPEAL_LIMIT" },
    );
  }

  const updatedUser = await UserRepository.updateById(userId, {
    appealStatus: "pending",
    appealMessage: message,
    appealedAt: new Date(),
    helperApplicationStatus: HelperApplicationStatus.PENDING_APPEAL,
    $inc: { appealCount: 1 },
    $push: {
      applicationHistory: {
        appliedAt: new Date(),
        status: HelperApplicationStatus.PENDING_APPEAL,
      },
      adminActionHistory: {
        action: "HELPER_SUBMITTED_APPEAL",
        // The audit row references a User: the helper themself did this.
        adminId: user._id,
        reason: message,
        previousStatus: "rejected",
        newStatus: "pending_appeal",
        timestamp: new Date(),
      },
    },
  });

  await invalidateMe(userId);

  return updatedUser;
};

// ─── FCM Device Tokens (several devices per user) ───────
const registerDeviceToken = async (
  userId: string,
  payload: { token: string; platform?: "android" | "ios"; locale?: string },
) => {
  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const platform = payload.platform || "android";

  // Strip this token from any other account (account switch / shared device)
  await UserRepository.clearDeviceTokenFromOthers(userId, payload.token);

  // Replace an older entry of the same token, keep the newest few devices.
  await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token: payload.token } } });
  await User.updateOne(
    { _id: userId },
    {
      $push: {
        deviceTokens: {
          $each: [{ token: payload.token, platform, updatedAt: new Date() }],
          $slice: -MAX_DEVICES,
        },
      },
      $set: {
        // Legacy single-token fields stay in sync for older code paths.
        deviceToken: payload.token,
        deviceTokenPlatform: platform,
        deviceTokenUpdatedAt: new Date(),
        ...(payload.locale ? { locale: payload.locale } : {}),
      },
    },
  );

  logger.info("[FCM] device token registered", {
    userId,
    platform,
    tokenPreview: String(payload.token).slice(0, 12) + "...",
  });

  return { registered: true };
};

/** Logout: remove this device's token (or every token when none is given). */
const clearDeviceToken = async (userId: string, token?: string) => {
  if (token) {
    await User.updateOne({ _id: userId }, { $pull: { deviceTokens: { token } } });
    await User.updateOne(
      { _id: userId, deviceToken: token },
      { $set: { deviceToken: null, deviceTokenUpdatedAt: new Date() } },
    );
  } else {
    await User.updateOne(
      { _id: userId },
      { $set: { deviceTokens: [], deviceToken: null, deviceTokenUpdatedAt: new Date() } },
    );
  }
  logger.info("[FCM] device token cleared", { userId, all: !token });
  return { cleared: true };
};

/** Remember the helper's last GPS fix (called by the socket layer, rate-limited there). */
const saveLastKnownLocation = async (userId: string, lon: number, lat: number) => {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        lastKnownLocation: { type: "Point", coordinates: [lon, lat] },
        lastKnownLocationAt: new Date(),
      },
    },
  );
};

// ─── Delete account (store requirement + data-protection right) ─────
const deleteAccount = async (userId: string, password: string) => {
  const user = await UserRepository.findById(userId, { populate: "auth" });
  if (!user) throw new AppError(StatusCodes.NOT_FOUND, "User not found");

  const authDoc = user.auth as any;
  if (!authDoc) throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  if (STAFF_ROLES.includes(authDoc.role) || authDoc.isSuperAdmin) {
    throw new AppError(StatusCodes.FORBIDDEN, "Admin accounts cannot be deleted here");
  }

  const withPassword = await AuthRepository.findById(String(authDoc._id), { select: "+password" });
  const ok = withPassword?.password ? await bcrypt.compare(password, withPassword.password) : false;
  if (!ok) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Password is incorrect", {
      code: "WRONG_PASSWORD",
    });
  }

  const { Job } = await import("module/job/job.model");
  const active = await Job.exists({
    $or: [{ postedBy: userId }, { assignedTo: userId }],
    status: { $in: ["in_progress", "on_the_way", "arrived"] },
  } as any);
  if (active) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "You have a job in progress. Finish or cancel it before deleting your account.",
      { code: "ACTIVE_JOBS" },
    );
  }

  const { Wallet } = await import("module/wallet/wallet.model");
  const wallet = await Wallet.findOne({ user: userId }).select("balance").lean();
  if (wallet && wallet.balance > 0) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "Your wallet still has a balance. Please contact support to settle it before deleting your account.",
      { code: "WALLET_NOT_EMPTY", params: { balance: wallet.balance } },
    );
  }

  // Release everything that is still open on either side.
  const { JobService } = await import("module/job/job.service");
  const openJobs: any[] = await Job.find({
    postedBy: userId,
    status: { $in: ["open", "pending_payment"] },
  } as any).select("_id");
  for (const j of openJobs) {
    await JobService.cancelJob(userId, String(j._id), "Account deleted by the client").catch(() => undefined);
  }
  const { ChatService } = await import("module/chat/chat.service");
  await ChatService.releaseOffersOfUser(userId).catch(() => undefined);

  // Remove personal files (best effort) and anonymise the profile. Financial
  // records (jobs, payments, ledger) are kept, as the law requires.
  for (const raw of [user.avatar, user.coverPhoto, user.documentUrl, user.selfieUrl, ...(user.profilePhotos || [])]) {
    const key = raw ? toStorageKey(raw) : "";
    if (key) await deleteFromMinio(key).catch(() => undefined);
  }

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        name: "Deleted user",
        isDeleted: true,
        isAvailable: false,
        profilePhotos: [],
        deviceTokens: [],
        deviceToken: null,
      },
      $unset: {
        email: 1,
        phone: 1,
        avatar: 1,
        coverPhoto: 1,
        bio: 1,
        address: 1,
        location: 1,
        lastKnownLocation: 1,
        documentUrl: 1,
        selfieUrl: 1,
        maskedDocumentNumber: 1,
        diditSessionId: 1,
      },
    },
  );

  // Free the phone number and end every session.
  await AuthRepository.updateById(String(authDoc._id), {
    isDeleted: true,
    $unset: { phone: 1, email: 1, password: 1 },
  } as any);
  await revokeAllSessions(String(authDoc._id));
  disconnectUserSockets(userId);
  await invalidateMe(userId);

  return { message: "Account deleted" };
};

export const UserService = {
  getMe,
  updateProfile,
  updateLocation,
  setAvailability,
  acceptLegal,
  helperApply,
  getApplicationStatus,
  searchHelpers,
  getHelperProfile,
  submitAppeal,
  registerDeviceToken,
  clearDeviceToken,
  saveLastKnownLocation,
  deleteAccount,
};
