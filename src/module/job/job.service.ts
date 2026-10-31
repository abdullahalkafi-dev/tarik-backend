import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { Types } from "mongoose";
import { JobRepository } from "./job.repository";
import { Job } from "./job.model";
import { User } from "../user/user.model";
import { UserRepository } from "../user/user.repository";
import { CategoryRepository } from "../category/category.repository";
import { CategoryService } from "../category/category.service";
import { SettingsService } from "../settings/settings.service";
import { WalletRepository } from "../wallet/wallet.repository";
import { ACTIVE_JOB_STATUSES, JobStatus, PaymentMethod } from "./job.interface";
import { emitToUser, emitToUsers } from "../../socket/socket.gateway";
import { SocketTrackingService } from "../../socket/socket.tracking";
import { notifyManyT, notifyUserT } from "../../util/notifyUser";
import { notifyAdmins } from "../../util/notifyAdmins";
import { logger } from "../../logger/logger";
import { commissionFor, computePricing, helperNetFor } from "../../util/pricing";
import { buildSchedule, extractDateParts, zonedToUtc } from "../../util/schedule";
import { assertOwnUploadKeys } from "../../util/uploadKey";
import { haversineKm, roundKm } from "../../util/geo";
import { toParticipantJob, toPublicJob, toStaffJob } from "./job.serializer";

/** Hours the client has to confirm after the helper says "finished" before it auto-completes. */
export const CONFIRM_WINDOW_HOURS = 48;
/** A helper cancelling this long before the start (or right after accepting) keeps their commission. */
const FREE_HELPER_CANCEL_HOURS = 3;
const ACCEPT_GRACE_MINUTES = 15;
/** Jobs may start at most this long ago (clock drift / "right now" jobs). */
const PAST_START_GRACE_MINUTES = 30;
const MAX_ACTIVE_JOBS_PER_HELPER = 3;
const SCHEDULE_BUFFER_MINUTES = 30;
const STRIKES_BEFORE_BLOCK = 3;
const STRIKE_BLOCK_DAYS = 7;
const STAFF_ROLES = ["admin", "superAdmin", "staff"];

const idOf = (v: any): string => String(v?._id ?? v ?? "");
const isStaffRole = (role?: string) => STAFF_ROLES.includes(String(role));

type TCreateJobPayload = {
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  budget: number;
  budgetType?: "hourly" | "fixed";
  paymentMethod?: "online" | "cash";
  address: string;
  longitude: number;
  latitude: number;
  images?: string[];
  category: string;
};

type TUpdateJobPayload = Partial<
  Pick<
    TCreateJobPayload,
    "title" | "description" | "date" | "startTime" | "endTime" | "budget" | "address" | "longitude" | "latitude" | "images"
  >
>;

type TViewer = { userId: string; role?: string };

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

// ─── Schedule helpers ───────────────────────────────────
/**
 * Start must not lie in the past (small grace for "right now" jobs). Without a
 * start time the calendar day itself must not be over.
 */
export const assertScheduleNotPast = (
  date: string | undefined,
  schedule: { startAt?: Date; endAt?: Date },
) => {
  const now = Date.now();
  if (schedule.startAt) {
    if (schedule.startAt.getTime() < now - PAST_START_GRACE_MINUTES * 60_000) {
      throw new AppError(StatusCodes.BAD_REQUEST, "The start time is in the past", {
        code: "START_IN_PAST",
      });
    }
    return;
  }
  const day = extractDateParts(date);
  if (!day) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid date", { code: "INVALID_DATE" });
  }
  const endOfDay = zonedToUtc(day.year, day.month, day.day, 23 * 60 + 59);
  if (endOfDay.getTime() < now) {
    throw new AppError(StatusCodes.BAD_REQUEST, "The date is in the past", {
      code: "DATE_IN_PAST",
    });
  }
};

/** Date column keeps the calendar day (midnight UTC), exactly as before. */
export const dayToDate = (date: string): Date => {
  const d = extractDateParts(date)!;
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
};

const minimumServiceAmount = async (): Promise<number> => {
  try {
    const settings = await SettingsService.getSettings();
    return Number(settings?.minimumServiceAmount) || 0;
  } catch {
    return 0;
  }
};

// ─── Matching: who gets a job ──────────────────────────
const DEFAULT_HELPER_RADIUS_KM = 15;
const MAX_NOTIFY_HELPERS = 50;
const MAX_NOTIFY_DISTANCE_M = 60_000;

/**
 * One matching rule shared by push fan-out and the helper's job list:
 * approved, on duty, same category, and the job lies inside the helper's own
 * working radius. Nearest first.
 */
const findMatchingHelpers = async (job: any): Promise<{ id: string; distanceKm: number }[]> => {
  const coords = job?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return [];
  const categoryId = idOf(job.category);
  if (!Types.ObjectId.isValid(categoryId)) return [];

  const rows = await User.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [Number(coords[0]), Number(coords[1])] },
        distanceField: "distanceMeters",
        maxDistance: MAX_NOTIFY_DISTANCE_M,
        spherical: true,
        key: "location",
        query: {
          helperApplicationStatus: "approved",
          isBlocked: false,
          isDeleted: false,
          isAvailable: { $ne: false },
          serviceType: new Types.ObjectId(categoryId),
          _id: { $ne: new Types.ObjectId(idOf(job.postedBy)) },
        },
      },
    },
    {
      $match: {
        $expr: {
          $lte: [
            "$distanceMeters",
            { $multiply: [{ $ifNull: ["$serviceRadius", DEFAULT_HELPER_RADIUS_KM] }, 1000] },
          ],
        },
      },
    },
    { $limit: MAX_NOTIFY_HELPERS },
    { $project: { _id: 1, distanceMeters: 1 } },
  ]);

  return rows.map((r: any) => ({ id: String(r._id), distanceKm: roundKm(r.distanceMeters / 1000) }));
};

// ─── Notify Nearby Helpers ──────────────────────────────
export const notifyNearbyHelpers = async (job: any) => {
  try {
    if (!job || !job.location || !job.location.coordinates) return;

    const matches = await findMatchingHelpers(job);
    if (!matches.length) return;

    // Populated, image-resolved job — but in its PUBLIC shape: no phone, e-mail,
    // exact address or exact coordinates ever leave the server before acceptance.
    const full = job._id ? await JobRepository.findDetailsById(job._id) : null;
    const base = full || job;
    const jobId = String(job._id);
    const publicJob = toPublicJob(base);

    for (const m of matches) {
      emitToUser(m.id, "job:new_nearby", { ...publicJob, distanceKm: m.distanceKm });
    }

    await Job.updateOne({ _id: job._id }, { $set: { notifiedHelpers: matches.map((m) => new Types.ObjectId(m.id)) } });

    await notifyManyT(
      matches.map((m) => m.id),
      "job.new_nearby",
      { title: job.title, budget: job.budget },
      { jobId, type: "new_job" },
    );
  } catch (err) {
    logger.error("Failed to notify nearby helpers", err);
  }
};

/** Tell the helpers who were offered this job that it is gone (accepted / cancelled / expired). */
const announceJobUnavailable = async (jobId: string, exceptUserId?: string) => {
  try {
    const doc = await Job.findById(jobId).select("+notifiedHelpers").lean();
    const ids = (doc?.notifiedHelpers || []).map(String).filter((id) => id !== exceptUserId);
    if (ids.length) emitToUsers(ids, "job:unavailable", { jobId });
  } catch (_) {
    // best effort
  }
};

/** Both parties get a lightweight "something changed, refresh" event. */
const emitJobUpdated = (job: any, event?: string) => {
  const ownerId = idOf(job.postedBy);
  const helperId = job.assignedTo ? idOf(job.assignedTo) : null;
  const payload = { jobId: String(job._id), status: job.status };
  if (ownerId) {
    emitToUser(ownerId, "job:updated", payload);
    if (event) emitToUser(ownerId, event, job);
  }
  if (helperId) {
    emitToUser(helperId, "job:updated", payload);
    if (event) emitToUser(helperId, event, job);
  }
};

const history = (
  jobId: string,
  entry: { action: string; by?: string; byRole?: string; note?: string },
) => JobRepository.appendHistory(jobId, entry).catch((err) => logger.warn(`[JOB] history failed: ${err}`));

// ─── Create Job ─────────────────────────────────────────
const createJob = async (userId: string, payload: TCreateJobPayload) => {
  const category = await CategoryRepository.findById(payload.category);
  if (!category || category.isActive === false) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Category not found", { code: "CATEGORY_NOT_FOUND" });
  }

  const user = await UserRepository.findById(userId);
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const budgetType = payload.budgetType || "fixed";
  const paymentMethod = payload.paymentMethod || "cash";
  const isOnline = paymentMethod === "online";

  // The server decides the amount. Hourly: rate × hours (never just the rate).
  const pricing = computePricing({
    priceType: budgetType,
    amount: payload.budget,
    startTime: payload.startTime,
    endTime: payload.endTime,
  });

  const minBudget = await minimumServiceAmount();
  if (minBudget > 0 && pricing.total < minBudget) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Minimum job budget is ${minBudget} MAD`, {
      code: "MIN_BUDGET",
      params: { min: minBudget },
    });
  }
  if (budgetType === "hourly") {
    await CategoryService.assertMinHourlyRate(category._id, payload.budget);
  }

  const schedule = buildSchedule(payload.date, payload.startTime, payload.endTime);
  assertScheduleNotPast(payload.date, schedule);

  const images = assertOwnUploadKeys(payload.images, userId, { kinds: ["images"] });

  const jobData: any = {
    title: payload.title,
    description: payload.description,
    budget: pricing.total,
    budgetType,
    ...(pricing.hourlyRate !== undefined ? { hourlyRate: pricing.hourlyRate, hours: pricing.hours } : {}),
    paymentMethod,
    status: isOnline ? JobStatus.PENDING_PAYMENT : JobStatus.OPEN,
    postedBy: userId,
    category: payload.category,
    images,
    date: dayToDate(payload.date),
    startTime: payload.startTime,
    endTime: payload.endTime,
    ...(schedule.startAt ? { startAt: schedule.startAt } : {}),
    ...(schedule.endAt ? { endAt: schedule.endAt } : {}),
    address: payload.address,
    location: { type: "Point", coordinates: [payload.longitude, payload.latitude] },
  };

  const job = await JobRepository.create(jobData);
  await history(String(job._id), { action: "created", by: userId, byRole: "client" });

  if (isOnline) {
    const { PaymentService } = await import("../payment/payment.service");
    const paymentSession = await PaymentService.initializePayment(userId, {
      amount: pricing.total,
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
  } catch (_) {
    // realtime is best effort
  }
  // Fan-out must not delay or fail the client's request.
  notifyNearbyHelpers(job).catch(() => undefined);
  return job;
};

// ─── Get Jobs (staff list) ──────────────────────────────
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

  if (query.category && Types.ObjectId.isValid(query.category)) filter.category = query.category;
  if (query.paymentMethod && query.paymentMethod !== "all") filter.paymentMethod = query.paymentMethod;
  if (query.assignedTo && Types.ObjectId.isValid(query.assignedTo)) filter.assignedTo = query.assignedTo;
  if (query.postedBy && Types.ObjectId.isValid(query.postedBy)) filter.postedBy = query.postedBy;

  if (query.search) {
    const re = { $regex: escapeRegex(query.search), $options: "i" };
    // Job text OR the client / helper name or phone.
    const people = await User.find({ $or: [{ name: re }, { phone: re }] }).select("_id").limit(100).lean();
    const ids = people.map((p) => p._id);
    filter.$or = [
      { title: re },
      { description: re },
      ...(ids.length ? [{ postedBy: { $in: ids } }, { assignedTo: { $in: ids } }] : []),
    ];
  }

  const result = await JobRepository.findAll(filter, {
    page: query.page || 1,
    limit: Math.min(query.limit || 20, 200),
  });
  return { ...result, docs: result.docs.map(toStaffJob) };
};

// ─── Get Nearby Jobs (helper's list) ────────────────────
const getNearbyJobs = async (
  userId: string,
  q: { lat?: number; lon?: number; maxDistance?: number; category?: string; page?: number; limit?: number },
) => {
  const user = await UserRepository.findById(userId);
  if (!user) throw new AppError(StatusCodes.NOT_FOUND, "User not found");

  // Position: the phone's current GPS, else its last reported position (if recent), else the saved profile location.
  let lon: number | undefined;
  let lat: number | undefined;
  if (q.lat != null && q.lon != null) {
    lat = q.lat;
    lon = q.lon;
    // The list is built from this position, so "Accept" must judge the distance from the same
    // place (otherwise a helper sees a job in the list and is then told it is out of range).
    const lastAt = user.lastKnownLocationAt ? new Date(user.lastKnownLocationAt).getTime() : 0;
    if (Date.now() - lastAt > 60_000) {
      UserRepository.updateById(userId, {
        lastKnownLocation: { type: "Point", coordinates: [lon, lat] },
        lastKnownLocationAt: new Date(),
      } as any).catch(() => undefined);
    }
  } else if (
    user.lastKnownLocation?.coordinates?.length === 2 &&
    user.lastKnownLocationAt &&
    Date.now() - new Date(user.lastKnownLocationAt).getTime() < 6 * 3_600_000
  ) {
    [lon, lat] = user.lastKnownLocation.coordinates;
  } else if (user.location?.coordinates?.length === 2) {
    [lon, lat] = user.location.coordinates;
  }
  if (lon == null || lat == null) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Please set your location first", {
      code: "LOCATION_REQUIRED",
    });
  }

  const now = Date.now();
  const filter: any = {
    status: JobStatus.OPEN,
    postedBy: { $ne: new Types.ObjectId(userId) },
    // Jobs whose start is long gone are not offered any more.
    $or: [{ startAt: { $exists: false } }, { startAt: null }, { startAt: { $gte: new Date(now - 2 * 3_600_000) } }],
  };

  // Default: the helper's own trade. `category=all` shows everything.
  if (q.category && q.category !== "all" && Types.ObjectId.isValid(q.category)) {
    filter.category = new Types.ObjectId(q.category);
  } else if (!q.category && user.serviceType) {
    filter.category = user.serviceType;
  }

  const radiusM = q.maxDistance || (user.serviceRadius ? user.serviceRadius * 1000 : DEFAULT_HELPER_RADIUS_KM * 1000);
  const page = q.page || 1;
  const limit = Math.min(q.limit || 20, 50);

  const result = await JobRepository.findNearby(lon, lat, radiusM, filter, { page, limit });

  return {
    ...result,
    docs: result.docs.map((d: any) => toPublicJob(d, { latitude: lat, longitude: lon })),
  };
};

// ─── Get Job by ID (shape depends on who asks) ──────────
const getJobById = async (jobId: string, viewer: TViewer) => {
  if (!Types.ObjectId.isValid(jobId)) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }
  const job: any = await JobRepository.findDetailsById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  if (isStaffRole(viewer.role)) return toStaffJob(job);

  const isOwner = idOf(job.postedBy) === String(viewer.userId);
  const isAssigned = job.assignedTo && idOf(job.assignedTo) === String(viewer.userId);
  if (isOwner || isAssigned) return toParticipantJob(job, viewer.userId);

  // Anybody else (helpers browsing): only open jobs, public view only.
  if (job.status !== JobStatus.OPEN) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }
  const me = await UserRepository.findById(viewer.userId, { select: "location lastKnownLocation" });
  const c = me?.lastKnownLocation?.coordinates || me?.location?.coordinates;
  return toPublicJob(job, c && c.length === 2 ? { longitude: c[0], latitude: c[1] } : undefined);
};

// ─── Update Job ─────────────────────────────────────────
const updateJob = async (userId: string, jobId: string, payload: TUpdateJobPayload) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  if (idOf(job.postedBy) !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "You can only update your own jobs");
  }

  // Once a helper accepted, or the job is finished/cancelled, nothing can be edited:
  // price, time and place are what the helper agreed to.
  if (job.status !== JobStatus.OPEN && job.status !== JobStatus.PENDING_PAYMENT) {
    throw new AppError(StatusCodes.CONFLICT, "This job can no longer be edited", {
      code: "JOB_NOT_EDITABLE",
    });
  }

  const updateData: any = {};
  if (payload.title) updateData.title = payload.title;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.images) {
    updateData.images = assertOwnUploadKeys(payload.images, userId, {
      allowed: job.images || [],
      kinds: ["images"],
    });
  }

  // Money-relevant changes only on an UNPAID cash job that is still open.
  const startTime = payload.startTime ?? job.startTime;
  const endTime = payload.endTime ?? job.endTime;
  const date = payload.date ?? (job.date ? job.date.toISOString() : undefined);

  const touchesSchedule = payload.date !== undefined || payload.startTime !== undefined || payload.endTime !== undefined;
  const touchesPrice = payload.budget !== undefined;
  const touchesPlace = payload.address !== undefined || payload.longitude != null || payload.latitude != null;

  if ((touchesSchedule || touchesPrice || touchesPlace) && (job.paymentMethod === PaymentMethod.ONLINE || job.status !== JobStatus.OPEN)) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "Price, time and place of a paid job cannot be changed. Cancel it and post a new one.",
      { code: "PAID_JOB_LOCKED" },
    );
  }

  if (touchesSchedule) {
    const schedule = buildSchedule(date, startTime, endTime);
    assertScheduleNotPast(date, schedule);
    if (payload.date) updateData.date = dayToDate(payload.date);
    if (payload.startTime !== undefined) updateData.startTime = payload.startTime;
    if (payload.endTime !== undefined) updateData.endTime = payload.endTime;
    updateData.startAt = schedule.startAt;
    updateData.endAt = schedule.endAt;
  }

  if (touchesPrice || (touchesSchedule && job.budgetType === "hourly")) {
    const amount = touchesPrice ? payload.budget! : job.hourlyRate || job.budget;
    const pricing = computePricing({
      priceType: job.budgetType as "fixed" | "hourly",
      amount,
      startTime,
      endTime,
    });
    const minBudget = await minimumServiceAmount();
    if (minBudget > 0 && pricing.total < minBudget) {
      throw new AppError(StatusCodes.BAD_REQUEST, `Minimum job budget is ${minBudget} MAD`, {
        code: "MIN_BUDGET",
        params: { min: minBudget },
      });
    }
    if (job.budgetType === "hourly") {
      await CategoryService.assertMinHourlyRate(job.category, amount);
    }
    updateData.budget = pricing.total;
    if (pricing.hourlyRate !== undefined) {
      updateData.hourlyRate = pricing.hourlyRate;
      updateData.hours = pricing.hours;
    }
  }

  if (payload.address !== undefined) updateData.address = payload.address;
  if (payload.longitude != null && payload.latitude != null) {
    updateData.location = { type: "Point", coordinates: [payload.longitude, payload.latitude] };
  }

  if (!Object.keys(updateData).length) return job;

  const updated = await JobRepository.updateById(jobId, updateData);
  await history(jobId, { action: "edited", by: userId, byRole: "client" });
  return updated;
};

// ─── Accept Job ─────────────────────────────────────────
const assertHelperCanTake = async (helper: any, job: any) => {
  if (helper.helperApplicationStatus !== "approved") {
    throw new AppError(StatusCodes.FORBIDDEN, "Your helper account is not approved to accept jobs", {
      code: "NOT_APPROVED",
    });
  }
  if (helper.isBlocked || (helper.auth as any)?.isBlacklisted) {
    throw new AppError(StatusCodes.FORBIDDEN, "Account is not allowed to accept jobs");
  }
  if (helper.isAvailable === false) {
    throw new AppError(StatusCodes.FORBIDDEN, "Switch to \"available\" to accept jobs", {
      code: "OFF_DUTY",
    });
  }
  if (helper.cancelStrikeUntil && new Date(helper.cancelStrikeUntil).getTime() > Date.now()) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Accepting jobs is paused because of repeated late cancellations",
      { code: "STRIKE_BLOCK", params: { until: helper.cancelStrikeUntil } },
    );
  }

  // The helper's trade and working radius must match the job.
  if (!helper.serviceType || idOf(helper.serviceType) !== idOf(job.category)) {
    throw new AppError(StatusCodes.FORBIDDEN, "This job is outside your service category", {
      code: "CATEGORY_MISMATCH",
    });
  }
  const jobCoords = job.location?.coordinates;
  const helperCoords =
    (helper.lastKnownLocation?.coordinates?.length === 2 &&
      helper.lastKnownLocationAt &&
      Date.now() - new Date(helper.lastKnownLocationAt).getTime() < 6 * 3_600_000 &&
      helper.lastKnownLocation.coordinates) ||
    helper.location?.coordinates;
  if (Array.isArray(jobCoords) && jobCoords.length === 2 && Array.isArray(helperCoords) && helperCoords.length === 2) {
    const km = haversineKm(helperCoords[1], helperCoords[0], jobCoords[1], jobCoords[0]);
    const radius = Number(helper.serviceRadius) || DEFAULT_HELPER_RADIUS_KM;
    if (km > radius + 1) {
      throw new AppError(StatusCodes.FORBIDDEN, "This job is outside your service radius", {
        code: "OUT_OF_RADIUS",
        params: { distanceKm: roundKm(km), radiusKm: radius },
      });
    }
  }

  // Time: not over, and no clash with another job of this helper.
  if (job.endAt && new Date(job.endAt).getTime() < Date.now()) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This job's time has already passed", {
      code: "JOB_EXPIRED",
    });
  }
  await assertHelperFreeForSlot(helper._id, job.startAt, job.endAt);
};

/** Not too many parallel jobs, and no overlap (± buffer) with another assigned job. */
export const assertHelperFreeForSlot = async (
  helperId: unknown,
  startAt?: Date | string | null,
  endAt?: Date | string | null,
) => {
  const activeCount = await Job.countDocuments({
    assignedTo: helperId,
    status: { $in: ACTIVE_JOB_STATUSES },
  } as any);
  if (activeCount >= MAX_ACTIVE_JOBS_PER_HELPER) {
    throw new AppError(StatusCodes.CONFLICT, "You already have the maximum number of active jobs", {
      code: "TOO_MANY_ACTIVE_JOBS",
      params: { max: MAX_ACTIVE_JOBS_PER_HELPER },
    });
  }
  if (startAt) {
    const s = new Date(startAt).getTime();
    const start = s - SCHEDULE_BUFFER_MINUTES * 60_000;
    const end = new Date(endAt || s + 3_600_000).getTime() + SCHEDULE_BUFFER_MINUTES * 60_000;
    const clash = await Job.exists({
      assignedTo: helperId,
      status: { $in: ACTIVE_JOB_STATUSES },
      startAt: { $lt: new Date(end) },
      endAt: { $gt: new Date(start) },
    } as any);
    if (clash) {
      throw new AppError(StatusCodes.CONFLICT, "This job overlaps with another job of yours", {
        code: "SCHEDULE_CONFLICT",
      });
    }
  }
};

const acceptJob = async (helperId: string, jobId: string) => {
  const helper = await UserRepository.findById(helperId, { populate: "auth" });
  if (!helper) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  if (job.status !== JobStatus.OPEN) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This job is no longer open for acceptance", {
      code: "JOB_NOT_OPEN",
    });
  }

  if (idOf(job.postedBy) === String(helperId)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "You cannot accept your own job post");
  }

  await assertHelperCanTake(helper, job);

  // The fee in force NOW is frozen on the job; later fee changes never touch it.
  const feePct = await SettingsService.getFeePercentage();
  const isCash = job.paymentMethod === PaymentMethod.CASH;
  const commission = isCash ? commissionFor(job.budget, feePct) : 0;
  const helperNet = helperNetFor(job.budget, feePct);

  if (commission > 0) {
    // Insufficient balance etc. come back as an AppError with a stable code.
    await WalletRepository.deductCommission(helperId, commission, jobId);
  }

  // Atomic claim — only one helper wins OPEN → IN_PROGRESS
  const updatedJob = await JobRepository.claimOpenJob(jobId, helperId, {
    commission,
    feePercentage: feePct,
    helperNet,
  });

  if (!updatedJob) {
    // Someone else claimed it — give back the commission we just took
    if (commission > 0) {
      try {
        await WalletRepository.refundCommission(helperId, commission, jobId);
      } catch (err) {
        logger.error(`[JOB] commission refund after lost race failed for job ${jobId}: ${err}`);
      }
    }
    throw new AppError(StatusCodes.BAD_REQUEST, "This job is no longer open for acceptance", {
      code: "JOB_NOT_OPEN",
    });
  }

  const ownerId = idOf(job.postedBy);
  emitToUser(ownerId, "job:accepted", updatedJob);
  emitToUser(helperId, "job:updated", { jobId, status: updatedJob.status });
  announceJobUnavailable(jobId, helperId).catch(() => undefined);

  notifyUserT(ownerId, "job.accepted", { title: job.title }, { type: "job_accepted", jobId }).catch(() => undefined);

  await history(jobId, {
    action: "accepted",
    by: helperId,
    byRole: "helper",
    note: commission > 0 ? `Commission ${commission} MAD (${feePct}%)` : `Fee ${feePct}%`,
  });

  return updatedJob;
};

// ─── Helper progress: on the way / arrived / finished ───
const assertAssignedHelper = async (userId: string, jobId: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  if (!job.assignedTo || idOf(job.assignedTo) !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only the assigned helper can do this");
  }
  return job;
};

const helperName = async (userId: string) =>
  (await UserRepository.findById(userId, { select: "name" }))?.name || "";

const markOnTheWay = async (userId: string, jobId: string) => {
  const job = await assertAssignedHelper(userId, jobId);
  const updated = await JobRepository.markOnTheWay(jobId, userId);
  if (!updated) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Cannot start travelling from status ${job.status}`, {
      code: "INVALID_TRANSITION",
    });
  }
  emitJobUpdated(updated);
  notifyUserT(
    idOf(job.postedBy),
    "job.on_the_way",
    { name: await helperName(userId), title: job.title },
    { type: "job_on_the_way", jobId },
  ).catch(() => undefined);
  await history(jobId, { action: "on_the_way", by: userId, byRole: "helper" });
  return updated;
};

const markArrived = async (userId: string, jobId: string) => {
  const job = await assertAssignedHelper(userId, jobId);
  const updated = await JobRepository.markArrived(jobId, userId);
  if (!updated) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Cannot mark arrival from status ${job.status}`, {
      code: "INVALID_TRANSITION",
    });
  }
  emitJobUpdated(updated);
  notifyUserT(
    idOf(job.postedBy),
    "job.arrived",
    { name: await helperName(userId), title: job.title },
    { type: "job_arrived", jobId },
  ).catch(() => undefined);
  await history(jobId, { action: "arrived", by: userId, byRole: "helper" });
  return updated;
};

/** The helper says the work is done; the client confirms, or it auto-completes after the window. */
const markFinished = async (userId: string, jobId: string) => {
  const job = await assertAssignedHelper(userId, jobId);
  if (job.disputeOpen) {
    throw new AppError(StatusCodes.CONFLICT, "A problem is open on this job. Support will decide.", {
      code: "DISPUTE_OPEN",
    });
  }
  const updated = await JobRepository.markFinishedByHelper(jobId, userId, CONFIRM_WINDOW_HOURS);
  if (!updated) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This job cannot be marked as finished", {
      code: "INVALID_TRANSITION",
    });
  }
  emitJobUpdated(updated, "job:finished");
  notifyUserT(
    idOf(job.postedBy),
    "job.finished_confirm",
    { name: await helperName(userId), title: job.title, hours: CONFIRM_WINDOW_HOURS },
    { type: "job_finished", jobId },
  ).catch(() => undefined);
  await history(jobId, { action: "finished", by: userId, byRole: "helper" });
  return updated;
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

const populateFields = "postedBy,assignedTo,category";
const HISTORY_PAGE = 30;

const statusCounts = async (match: Record<string, unknown>) => {
  const rows = await Job.aggregate([{ $match: match }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r._id] = r.n;
  return counts;
};

const getMyBookings = async (
  userId: string,
  q: { tab?: "completed" | "cancelled"; page?: number; limit?: number } = {},
) => {
  const base = { postedBy: new Types.ObjectId(userId) };
  const limit = Math.min(q.limit || HISTORY_PAGE, 50);
  const page = q.page || 1;

  // One finished tab, page by page.
  if (q.tab) {
    const status = q.tab === "completed" ? JobStatus.COMPLETED : JobStatus.CANCELLED;
    const docs = await JobRepository.findMany(
      { ...base, status },
      { sort: { createdAt: -1 }, populate: populateFields, skip: (page - 1) * limit, limit },
    );
    const total = await Job.countDocuments({ ...base, status });
    const shaped = q.tab === "completed" ? await attachMyReviews(docs, userId) : docs;
    return { docs: shaped, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  const [live, completedRaw, cancelled, counts] = await Promise.all([
    JobRepository.findMany(
      { ...base, status: { $in: [JobStatus.OPEN, JobStatus.PENDING_PAYMENT, ...ACTIVE_JOB_STATUSES] } },
      { sort: { createdAt: -1 }, populate: populateFields },
    ),
    JobRepository.findMany(
      { ...base, status: JobStatus.COMPLETED },
      { sort: { createdAt: -1 }, populate: populateFields, limit },
    ),
    JobRepository.findMany(
      { ...base, status: JobStatus.CANCELLED },
      { sort: { createdAt: -1 }, populate: populateFields, limit },
    ),
    statusCounts(base),
  ]);

  const active = live.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status));
  const awaiting = live.filter((j) => j.status === JobStatus.OPEN);
  const unpaid = live.filter((j) => j.status === JobStatus.PENDING_PAYMENT);
  const completed = await attachMyReviews(completedRaw, userId);

  return { active, awaiting, completed, cancelled, unpaid, counts };
};

// ─── Get Helper's Assigned Jobs ─────────────────────────
const getMyAssignedJobs = async (
  helperId: string,
  q: { tab?: "completed" | "cancelled"; page?: number; limit?: number } = {},
) => {
  const base = { assignedTo: new Types.ObjectId(helperId) };
  const limit = Math.min(q.limit || HISTORY_PAGE, 50);
  const page = q.page || 1;

  if (q.tab) {
    const status = q.tab === "completed" ? JobStatus.COMPLETED : JobStatus.CANCELLED;
    const docs = await JobRepository.findMany(
      { ...base, status },
      { sort: { createdAt: -1 }, populate: populateFields, skip: (page - 1) * limit, limit },
    );
    const total = await Job.countDocuments({ ...base, status });
    const shaped = q.tab === "completed" ? await attachMyReviews(docs, helperId) : docs;
    return { docs: shaped, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  const [active, completedRaw, cancelled, counts] = await Promise.all([
    JobRepository.findMany(
      { ...base, status: { $in: ACTIVE_JOB_STATUSES } },
      { sort: { createdAt: -1 }, populate: populateFields },
    ),
    JobRepository.findMany(
      { ...base, status: JobStatus.COMPLETED },
      { sort: { createdAt: -1 }, populate: populateFields, limit },
    ),
    JobRepository.findMany(
      { ...base, status: JobStatus.CANCELLED },
      { sort: { createdAt: -1 }, populate: populateFields, limit },
    ),
    statusCounts(base),
  ]);

  const completed = await attachMyReviews(completedRaw, helperId);
  return { active, completed, cancelled, counts };
};

// ─── Online payout (escrow release) ─────────────────────
/**
 * Credit the helper's net amount for a completed ONLINE job. The ledger entry
 * (unique per job) is written first, the flag afterwards, so a crash can never
 * mark a job as paid without the money, and a retry can never pay twice.
 */
export const payoutOnlineJob = async (jobId: string): Promise<boolean> => {
  const job: any = await Job.findById(jobId);
  if (!job || job.paymentMethod !== PaymentMethod.ONLINE || job.status !== JobStatus.COMPLETED || !job.assignedTo) {
    return false;
  }
  if (job.escrowCredited) return true;

  const feePct = job.feePercentage ?? (await SettingsService.getFeePercentage());
  const net = job.helperNet ?? helperNetFor(job.budget, feePct);
  const helperId = idOf(job.assignedTo);

  try {
    await WalletRepository.creditEarning(
      helperId,
      net,
      `escrow_${jobId}`,
      `Job payout for "${job.title}" (+${net} MAD)`,
    );
    await JobRepository.markEscrowCredited(jobId);
    return true;
  } catch (err: any) {
    logger.error(`[JOB] payout failed for job ${jobId}: ${err?.message || err}`);
    notifyAdmins("Payout failed", `Could not credit ${net} MAD for job ${jobId}. It will be retried.`, {
      type: "payout_failed",
      jobId,
    }).catch(() => undefined);
    return false;
  }
};

// ─── Complete Job ───────────────────────────────────────
const completeJob = async (
  userId: string,
  jobId: string,
  note?: string,
  options: { isAdmin?: boolean; isSystem?: boolean } = {},
) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  const isOwner = idOf(job.postedBy) === String(userId);

  // Client (owner) or admin only — helpers use "finished" / "cash received".
  if (!options.isAdmin && !options.isSystem && !isOwner) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only the client can mark this job as completed");
  }

  if (!ACTIVE_JOB_STATUSES.includes(job.status)) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Cannot complete a job with status ${job.status}`, {
      code: "INVALID_TRANSITION",
    });
  }
  if (job.disputeOpen && !options.isAdmin) {
    throw new AppError(StatusCodes.CONFLICT, "A problem is open on this job. Support will decide.", {
      code: "DISPUTE_OPEN",
    });
  }

  // Atomic active → COMPLETED (only one winner)
  const updatedJob = await JobRepository.transitionInProgressToCompleted(jobId);
  if (!updatedJob) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Job is no longer in progress", {
      code: "INVALID_TRANSITION",
    });
  }

  const helperId = job.assignedTo ? idOf(job.assignedTo) : null;
  const ownerId = idOf(job.postedBy);

  if (job.paymentMethod === PaymentMethod.ONLINE && helperId) {
    await payoutOnlineJob(jobId);
  }

  emitJobUpdated(updatedJob, "job:completed");
  if (helperId) SocketTrackingService.endJobTracking(jobId, helperId).catch(() => undefined);

  const actedByClient = ownerId === String(userId);
  if (options.isSystem) {
    notifyUserT(ownerId, "job.auto_completed", { title: job.title }, { type: "job_completed", jobId }).catch(() => undefined);
    if (helperId) {
      notifyUserT(helperId, "job.completed_helper", { title: job.title }, { type: "job_completed", jobId }).catch(() => undefined);
    }
  } else {
    if (!actedByClient) {
      notifyUserT(ownerId, "job.completed_client", { title: job.title }, { type: "job_completed", jobId }).catch(() => undefined);
    }
    if (helperId) {
      notifyUserT(helperId, "job.completed_helper", { title: job.title }, { type: "job_completed", jobId }).catch(() => undefined);
    }
  }

  await history(jobId, {
    action: options.isSystem ? "auto_completed" : "completed",
    by: options.isSystem ? undefined : userId,
    byRole: options.isSystem ? "system" : options.isAdmin ? "admin" : "client",
    note: note || undefined,
  });

  return updatedJob;
};

// ─── Cash received (helper only, after client completes) ─
const confirmCashReceived = async (userId: string, jobId: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  if (idOf(job.assignedTo) !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only the assigned helper can confirm cash payment");
  }

  if (job.paymentMethod !== PaymentMethod.CASH) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Cash confirmation only applies to cash jobs");
  }

  if (job.status !== JobStatus.COMPLETED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "The job must be completed before cash can be confirmed");
  }

  if (String(job.paymentStatus || "") === "paid") {
    throw new AppError(StatusCodes.BAD_REQUEST, "Cash payment already confirmed");
  }

  const updated = await JobRepository.markCashReceived(jobId);
  if (!updated) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Cash payment already confirmed or not eligible");
  }

  const ownerId = idOf(job.postedBy);
  if (ownerId !== String(userId)) {
    notifyUserT(ownerId, "job.cash_received", { title: job.title }, { type: "cash_received", jobId }).catch(() => undefined);
  }

  await history(jobId, { action: "cash_confirmed", by: userId, byRole: "helper", note: "Cash payment received" });

  return updated;
};

// ─── Cancel Job ─────────────────────────────────────────
const registerLateCancelStrike = async (helperId: string) => {
  const helper = await UserRepository.findById(helperId, { select: "cancelStrikes name" });
  const strikes = (helper?.cancelStrikes || 0) + 1;
  const set: any = { cancelStrikes: strikes };
  if (strikes >= STRIKES_BEFORE_BLOCK) {
    set.cancelStrikeUntil = new Date(Date.now() + STRIKE_BLOCK_DAYS * 86_400_000);
    set.cancelStrikes = 0;
    notifyAdmins(
      "Helper paused for late cancellations",
      `${helper?.name || helperId} cancelled ${STRIKES_BEFORE_BLOCK} accepted jobs late and cannot accept jobs for ${STRIKE_BLOCK_DAYS} days.`,
      { type: "helper_strike", userId: helperId },
    ).catch(() => undefined);
  }
  await User.updateOne({ _id: helperId }, { $set: set });
};

const cancelJob = async (
  userId: string,
  jobId: string,
  reason: string,
  options: { isAdmin?: boolean; isSystem?: boolean; code?: string } = {},
) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  const isAdmin = !!options.isAdmin;
  const isSystem = !!options.isSystem;
  const isOwner = idOf(job.postedBy) === String(userId);
  const isAssigned = !!job.assignedTo && idOf(job.assignedTo) === String(userId);

  if (!isAdmin && !isSystem && !isOwner && !isAssigned) {
    throw new AppError(StatusCodes.FORBIDDEN, "You are not authorized to cancel this job");
  }

  if (job.status === JobStatus.COMPLETED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Completed jobs cannot be cancelled");
  }

  if (job.status === JobStatus.CANCELLED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Job is already cancelled");
  }

  // Cancellation policy: once the helper has ARRIVED or said the work is
  // finished, neither side can walk away alone — support decides.
  const workStarted = job.status === JobStatus.ARRIVED || !!job.helperFinishedAt;
  if (!isAdmin && !isSystem && workStarted) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "The helper has already arrived. Please report a problem so support can help.",
      { code: "NEEDS_SUPPORT" },
    );
  }

  const cancelledByRole = isSystem ? "system" : isAdmin ? "admin" : isOwner ? "client" : "helper";

  // Atomic cancel — only the winner runs refunds
  const updatedJob = await JobRepository.transitionToCancelled(jobId, {
    reason,
    cancelledBy: isSystem ? undefined : userId,
    cancelledByRole,
    code: options.code,
  });
  if (!updatedJob) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Job can no longer be cancelled");
  }

  const helperId = job.assignedTo ? idOf(job.assignedTo) : null;
  const wasAssigned = ACTIVE_JOB_STATUSES.includes(job.status);

  // A helper who walks away late loses the prepaid commission and earns a strike.
  let forfeitCommission = false;
  if (wasAssigned && isAssigned && !isAdmin && !isSystem) {
    const acceptedRecently =
      job.acceptedAt && Date.now() - new Date(job.acceptedAt).getTime() < ACCEPT_GRACE_MINUTES * 60_000;
    const farFromStart =
      job.startAt && new Date(job.startAt).getTime() - Date.now() > FREE_HELPER_CANCEL_HOURS * 3_600_000;
    forfeitCommission = !(acceptedRecently || farFromStart);
    if (forfeitCommission) await registerLateCancelStrike(String(userId));
  }

  // Cash: give the prepaid commission back (unless forfeited as above)
  const commissionAmt = Number((updatedJob as any)?.commissionDeducted || job.commissionDeducted || 0);
  if (wasAssigned && job.paymentMethod === PaymentMethod.CASH && helperId && commissionAmt > 0 && !forfeitCommission) {
    try {
      await WalletRepository.refundCommission(helperId, commissionAmt, String(job._id));
    } catch (err: any) {
      logger.error(`[JOB] Failed to refund commission to helper: ${err?.message || err}`);
      await JobRepository.updateById(jobId, { refundStatus: "failed" } as any).catch(() => undefined);
      await history(jobId, {
        action: "cancelled",
        by: isSystem ? undefined : userId,
        byRole: cancelledByRole,
        note: `Commission refund failed (${commissionAmt} MAD): ${err?.message || err}`,
      });
      notifyUserT(helperId, "commission.refund_failed", { amount: commissionAmt }, {
        type: "payment_failed",
        jobId: String(job._id),
      }).catch(() => undefined);
      notifyAdmins("Commission refund failed", `Job ${jobId}: ${commissionAmt} MAD could not be returned to the helper.`, {
        type: "payment_failed",
        jobId,
      }).catch(() => undefined);
    }
  }

  // Online: gateway refund when a charge may exist.
  const maybeCharged =
    job.status === JobStatus.OPEN ||
    ACTIVE_JOB_STATUSES.includes(job.status) ||
    (job.status === JobStatus.PENDING_PAYMENT && (job as any).paymentStatus === "paid");

  if (job.paymentMethod === "online" && maybeCharged && (job.budget || 0) > 0) {
    try {
      const { PaymentService } = await import("../payment/payment.service");
      const refund = await PaymentService.refundJobPayment(String(job._id), reason);
      if (refund.success || refund.message !== "No completed payment found for this job") {
        await JobRepository.updateById(jobId, {
          refundStatus: refund.success ? "refunded" : "failed",
          refundReference: refund.reference || undefined,
        } as any);
        if (refund.success) {
          await history(jobId, {
            action: "refunded",
            by: isSystem ? undefined : userId,
            byRole: cancelledByRole,
            note: refund.reference || undefined,
          });
        }
      }
    } catch (err: any) {
      logger.error(`[JOB] Gateway refund failed: ${err?.message || err}`);
      await JobRepository.updateById(jobId, { refundStatus: "failed" } as any).catch(() => undefined);
    }
  }

  const finalJob = (await JobRepository.findById(jobId)) || updatedJob;

  emitJobUpdated(finalJob, "job:cancelled");
  if (job.status === JobStatus.OPEN) announceJobUnavailable(jobId).catch(() => undefined);
  if (helperId) SocketTrackingService.endJobTracking(jobId, helperId).catch(() => undefined);

  const ownerId = idOf(job.postedBy);
  const preview = reason ? truncate(reason, 60) : "";
  if (ownerId !== String(userId)) {
    notifyUserT(ownerId, "job.cancelled", { title: job.title, reason: preview }, { type: "job_cancelled", jobId }).catch(() => undefined);
  }
  if (helperId && helperId !== String(userId)) {
    notifyUserT(helperId, "job.cancelled", { title: job.title, reason: preview }, { type: "job_cancelled", jobId }).catch(() => undefined);
  }

  await history(jobId, {
    action: "cancelled",
    by: isSystem ? undefined : userId,
    byRole: cancelledByRole,
    note: forfeitCommission ? `${reason} (commission forfeited)` : reason,
  });

  return finalJob;
};

// ─── Report a problem (opens a dispute) ─────────────────
const reportProblem = async (userId: string, jobId: string, message: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) throw new AppError(StatusCodes.NOT_FOUND, "Job not found");

  const isOwner = idOf(job.postedBy) === String(userId);
  const isAssigned = !!job.assignedTo && idOf(job.assignedTo) === String(userId);
  if (!isOwner && !isAssigned) {
    throw new AppError(StatusCodes.FORBIDDEN, "You are not part of this job");
  }

  const reportable =
    ACTIVE_JOB_STATUSES.includes(job.status) ||
    (job.status === JobStatus.COMPLETED &&
      job.completedAt &&
      Date.now() - new Date(job.completedAt).getTime() < 7 * 86_400_000);
  if (!reportable) {
    throw new AppError(StatusCodes.BAD_REQUEST, "A problem can only be reported for an active or recently completed job", {
      code: "NOT_REPORTABLE",
    });
  }

  const { SupportService } = await import("../support/support.service");
  const ticket = await SupportService.createTicket(userId, {
    subject: `Job problem: ${truncate(job.title, 80)}`,
    message,
    category: "job",
    jobId,
    reportedUserId: isOwner ? idOf(job.assignedTo) || undefined : idOf(job.postedBy),
  });

  // Automatic completion and payout wait for support's decision.
  await JobRepository.setDispute(jobId, true);
  await history(jobId, { action: "dispute", by: userId, byRole: isOwner ? "client" : "helper", note: truncate(message, 200) });

  const otherId = isOwner ? idOf(job.assignedTo) : idOf(job.postedBy);
  if (otherId) {
    notifyUserT(otherId, "job.dispute_opened", { title: job.title }, { type: "job_dispute", jobId }).catch(() => undefined);
  }
  emitJobUpdated({ ...job.toObject(), disputeOpen: true });

  return { ticketId: ticket._id, ticketCode: (ticket as any).ticketId };
};

/** Admin: close the dispute so completion / payout can proceed again. */
const resolveDispute = async (jobId: string) => {
  const job = await JobRepository.setDispute(jobId, false);
  if (!job) throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  return job;
};

// ─── Retry unpaid job checkout ─────────────────────────
const retryJobCheckout = async (userId: string, jobId: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }
  if (idOf(job.postedBy) !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Not your job");
  }
  if (job.status !== JobStatus.PENDING_PAYMENT) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This job is not waiting for payment");
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
/**
 * Only a job nobody paid for can be erased. A paid online job (or one that is
 * assigned/finished) has to go through "cancel", which refunds and keeps the history.
 */
const deleteJob = async (userId: string, jobId: string) => {
  const job = await JobRepository.findById(jobId);
  if (!job) {
    throw new AppError(StatusCodes.NOT_FOUND, "Job not found");
  }

  if (idOf(job.postedBy) !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "You can only delete your own jobs");
  }

  const unpaid =
    job.status === JobStatus.PENDING_PAYMENT ||
    (job.status === JobStatus.OPEN && job.paymentMethod === PaymentMethod.CASH);
  if (!unpaid) {
    throw new AppError(StatusCodes.CONFLICT, "Cancel this job instead of deleting it", {
      code: "USE_CANCEL",
    });
  }

  await JobRepository.deleteById(jobId);
  announceJobUnavailable(jobId).catch(() => undefined);
  return { message: "Job deleted successfully" };
};

// ─── Background maintenance (called by cron) ───────────
/** Helper said "finished" and the client stayed silent: complete and pay out. */
export const autoCompleteDueJobs = async (): Promise<number> => {
  const due = await Job.find({
    status: { $in: ACTIVE_JOB_STATUSES },
    helperFinishedAt: { $exists: true },
    autoCompleteAt: { $lte: new Date() },
    disputeOpen: { $ne: true },
  })
    .select("_id postedBy")
    .limit(100)
    .lean();

  let done = 0;
  for (const j of due) {
    try {
      await completeJob(idOf(j.postedBy), String(j._id), "Confirmed automatically", { isSystem: true });
      done++;
    } catch (err) {
      logger.warn(`[CRON] auto-complete ${j._id} failed: ${err}`);
    }
  }
  return done;
};

/** Open jobs whose time has passed without a helper: cancel, refund, tell the client. */
export const expireStaleOpenJobs = async (): Promise<number> => {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const stale = await Job.find({
    status: JobStatus.OPEN,
    $or: [
      { startAt: { $lt: new Date(now.getTime() - 60 * 60_000) } },
      // No start time: expire a day after the calendar day began.
      { startAt: { $exists: false }, date: { $lt: dayAgo } },
      { startAt: null, date: { $lt: dayAgo } },
    ],
  })
    .select("_id postedBy title")
    .limit(100)
    .lean();

  let done = 0;
  for (const j of stale) {
    try {
      await cancelJob(idOf(j.postedBy), String(j._id), "No helper accepted before the start time", {
        isSystem: true,
        code: "NO_HELPER_FOUND",
      });
      notifyUserT(idOf(j.postedBy), "job.expired", { title: j.title }, { type: "job_expired", jobId: String(j._id) }).catch(() => undefined);
      done++;
    } catch (err) {
      logger.warn(`[CRON] expire ${j._id} failed: ${err}`);
    }
  }
  return done;
};

/** Unpaid online checkouts older than 24h are cancelled (with history + notification). */
export const expireUnpaidJobs = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - 24 * 3_600_000);
  const stale = await Job.find({
    status: JobStatus.PENDING_PAYMENT,
    paymentMethod: PaymentMethod.ONLINE,
    createdAt: { $lt: cutoff },
  })
    .select("_id postedBy")
    .limit(100)
    .lean();

  let done = 0;
  for (const j of stale) {
    try {
      await cancelJob(idOf(j.postedBy), String(j._id), "Payment not completed within 24 hours", {
        isSystem: true,
        code: "PAYMENT_TIMEOUT",
      });
      done++;
    } catch (err) {
      logger.warn(`[CRON] expire unpaid ${j._id} failed: ${err}`);
    }
  }
  return done;
};

/** Completed online jobs whose helper payout is missing (a crash or a wallet error): pay them now. */
export const reconcileOnlinePayouts = async (): Promise<number> => {
  const missing = await Job.find({
    status: JobStatus.COMPLETED,
    paymentMethod: PaymentMethod.ONLINE,
    escrowCredited: { $ne: true },
    assignedTo: { $exists: true },
    completedAt: { $lt: new Date(Date.now() - 2 * 60_000) },
  })
    .select("_id")
    .limit(100)
    .lean();

  let fixed = 0;
  for (const j of missing) {
    if (await payoutOnlineJob(String(j._id))) fixed++;
  }
  return fixed;
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
  markOnTheWay,
  markArrived,
  markFinished,
  reportProblem,
  resolveDispute,
  payoutOnlineJob,
};
