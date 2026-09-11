import { Types, QueryOptions } from "mongoose";
type FilterQuery<_T> = any;
import { Job } from "./job.model";
import { TJob } from "./job.interface";
import { resolveUrl } from "util/minio";

const resolveJobImages = (job: any) => {
  const obj = job.toObject ? job.toObject() : job;
  return {
    ...obj,
    images: obj.images?.map(resolveUrl).filter(Boolean) || [],
    postedBy: obj.postedBy && typeof obj.postedBy === "object" && "name" in obj.postedBy
      ? { ...obj.postedBy, avatar: resolveUrl(obj.postedBy.avatar) }
      : obj.postedBy,
    assignedTo: obj.assignedTo && typeof obj.assignedTo === "object" && "name" in obj.assignedTo
      ? { ...obj.assignedTo, avatar: resolveUrl(obj.assignedTo.avatar) }
      : obj.assignedTo,
    category: obj.category && typeof obj.category === "object" && "name" in obj.category
      ? { ...obj.category, icon: resolveUrl(obj.category.icon) }
      : obj.category,
  };
};

const create = async (data: Partial<TJob>) => {
  const job = await Job.create(data);
  return job;
};

const findById = async (
  id: string | Types.ObjectId,
  populate?: string,
) => {
  let query = Job.findById(id);
  if (populate) {
    const fields = populate.split(",");
    for (const field of fields) {
      query = query.populate(field.trim());
    }
  }
  return query.exec();
};

const findAll = async (
  filter: FilterQuery<TJob> = {},
  options: QueryOptions = {},
) => {
  const { page = 1, limit = 20, sort = { createdAt: -1 } } = options;
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    Job.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("postedBy", "name phone avatar email")
      .populate("assignedTo", "name phone avatar rating")
      .populate("category", "name icon")
      .exec(),
    Job.countDocuments(filter).exec(),
  ]);

  return {
    docs: docs.map(resolveJobImages),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

const updateById = async (
  id: string | Types.ObjectId,
  data: Partial<TJob>,
) => {
  return Job.findByIdAndUpdate(id, data, { new: true }).exec();
};

/**
 * Atomically claim an OPEN job for a helper.
 * Returns null if already taken / not open.
 */
const claimOpenJob = async (
  jobId: string | Types.ObjectId,
  helperId: string | Types.ObjectId,
  commissionDeducted: number,
) => {
  return Job.findOneAndUpdate(
    { _id: jobId, status: "open" } as any,
    {
      $set: {
        status: "in_progress",
        assignedTo: new Types.ObjectId(helperId),
        commissionDeducted,
      },
    },
    { new: true },
  ).exec();
};

/**
 * Atomically move IN_PROGRESS → COMPLETED.
 * Returns null if not in progress (already completed/cancelled).
 */
const transitionInProgressToCompleted = async (
  jobId: string | Types.ObjectId,
) => {
  return Job.findOneAndUpdate(
    { _id: jobId, status: "in_progress" } as any,
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
      },
    },
    { new: true },
  ).exec();
};

/**
 * Mark escrow credited only once (prevents double wallet credit).
 */
const markEscrowCredited = async (jobId: string | Types.ObjectId) => {
  return Job.findOneAndUpdate(
    { _id: jobId, escrowCredited: { $ne: true } } as any,
    { $set: { escrowCredited: true } },
    { new: true },
  ).exec();
};

/**
 * Helper confirms cash received after client completed the job.
 * Sets paymentStatus → paid once. Returns null if not eligible.
 */
const markCashReceived = async (jobId: string | Types.ObjectId) => {
  return Job.findOneAndUpdate(
    {
      _id: jobId,
      paymentMethod: "cash",
      status: "completed",
      paymentStatus: { $ne: "paid" },
    } as any,
    { $set: { paymentStatus: "paid" } },
    { new: true },
  ).exec();
};

/**
 * Atomically cancel OPEN or IN_PROGRESS job (winner does refunds).
 * Returns null if already completed/cancelled.
 */
const transitionToCancelled = async (
  jobId: string | Types.ObjectId,
  payload: {
    reason: string;
    cancelledBy: string | Types.ObjectId;
    refundStatus?: string;
    refundReference?: string;
  },
) => {
  return Job.findOneAndUpdate(
    {
      _id: jobId,
      status: { $in: ["open", "in_progress", "pending_payment"] },
    } as any,
    {
      $set: {
        status: "cancelled",
        cancellationReason: payload.reason,
        cancelledBy: new Types.ObjectId(payload.cancelledBy),
        cancelledAt: new Date(),
        ...(payload.refundStatus ? { refundStatus: payload.refundStatus } : {}),
        ...(payload.refundReference
          ? { refundReference: payload.refundReference }
          : {}),
      },
    },
    { new: true },
  ).exec();
};

/**
 * Online payment: only OPEN if still PENDING_PAYMENT.
 */
const markPendingPaymentOpen = async (jobId: string | Types.ObjectId) => {
  return Job.findOneAndUpdate(
    { _id: jobId, status: "pending_payment" } as any,
    { $set: { status: "open" } },
    { new: true },
  ).exec();
};

/**
 * Count by status (for admin pipeline panel).
 */
const countByStatus = async () => {
  const rows = await Job.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts: Record<string, number> = {
    pending_payment: 0,
    open: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const row of rows) {
    if (row._id) counts[row._id] = row.count;
  }
  return counts;
};

/**
 * Cancellations with parties + lifetime cancel counts.
 */
const findCancellations = async (
  page = 1,
  limit = 20,
  search?: string,
) => {
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = { status: "cancelled" };
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { cancellationReason: { $regex: search, $options: "i" } },
    ];
  }

  const [docs, total] = await Promise.all([
    Job.find(filter as any)
      .sort({ cancelledAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("postedBy", "name phone email avatar")
      .populate("assignedTo", "name phone email avatar")
      .populate("category", "name")
      .exec(),
    Job.countDocuments(filter as any).exec(),
  ]);

  // Lifetime cancel counts — client vs helper separately
  const userIds = new Set<string>();
  for (const job of docs) {
    const p = (job as any).postedBy?._id;
    const a = (job as any).assignedTo?._id;
    if (p) userIds.add(String(p));
    if (a) userIds.add(String(a));
  }

  const clientCounts = new Map<string, number>();
  const helperCounts = new Map<string, number>();
  await Promise.all(
    [...userIds].map(async (id) => {
      const [asClient, asHelper] = await Promise.all([
        Job.countDocuments({ status: "cancelled", postedBy: id } as any),
        Job.countDocuments({ status: "cancelled", assignedTo: id } as any),
      ]);
      clientCounts.set(id, asClient);
      helperCounts.set(id, asHelper);
    }),
  );

  const enriched = docs.map((job) => {
    const obj = resolveJobImages(job);
    const clientId = obj.postedBy?._id ? String(obj.postedBy._id) : null;
    const helperId = obj.assignedTo?._id ? String(obj.assignedTo._id) : null;
    return {
      ...obj,
      clientCancelCount: clientId ? clientCounts.get(clientId) || 0 : 0,
      helperCancelCount: helperId ? helperCounts.get(helperId) || 0 : 0,
    };
  });

  return {
    docs: enriched,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Append an audit history entry (accept / complete / cancel / refund).
 */
const appendHistory = async (
  jobId: string | Types.ObjectId,
  entry: {
    action: string;
    by?: string | Types.ObjectId;
    byRole?: string;
    note?: string;
  },
) => {
  return Job.findByIdAndUpdate(
    jobId,
    {
      $push: {
        history: {
          ...entry,
          by: entry.by ? new Types.ObjectId(entry.by) : undefined,
          at: new Date(),
        },
      },
    },
    { new: true },
  ).exec();
};

const deleteById = async (id: string | Types.ObjectId) => {
  return Job.findByIdAndDelete(id).exec();
};

const findNearby = async (
  longitude: number,
  latitude: number,
  maxDistance: number = 10000, // default 10km
  additionalFilter: FilterQuery<TJob> = {},
  options: QueryOptions = {},
) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const geoFilter: FilterQuery<TJob> = {
    ...additionalFilter,
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistance,
      },
    },
  };

  // $near can't be used in countDocuments (MongoDB 5.1+ aggregation restriction).
  // Use $geoWithin + $centerSphere for the count instead.
  const countFilter: FilterQuery<TJob> = {
    ...additionalFilter,
    location: {
      $geoWithin: {
        $centerSphere: [[longitude, latitude], maxDistance / 6378100],
      },
    },
  };

  const [docs, total] = await Promise.all([
    // $near already sorts by distance — no .sort() needed
    Job.find(geoFilter).skip(skip).limit(limit).populate("postedBy", "name avatar").populate("category", "name icon").exec(),
    Job.countDocuments(countFilter).exec(),
  ]);

  const R = 6378100; // earth radius meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const docsWithDistance = docs.map((doc) => {
    const obj = resolveJobImages(doc) as any;
    const coords = obj.location?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const [lng, lat] = coords;
      const dLat = toRad(Number(lat) - latitude);
      const dLng = toRad(Number(lng) - longitude);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(latitude)) *
          Math.cos(toRad(Number(lat))) *
          Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const meters = R * c;
      obj.distanceKm = Math.round((meters / 1000) * 10) / 10;
      if (typeof obj.address === "string" && obj.address.includes(",")) {
        const parts = obj.address.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          obj.address = `${parts[0]}, ${parts[1]}`;
        }
      }
      delete obj.location;
    }
    return obj;
  });

  return {
    docs: docsWithDistance,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

const findMany = async (
  filter: FilterQuery<TJob> = {},
  options: { sort?: any; populate?: string } = {},
) => {
  let query = Job.find(filter);
  if (options.sort) {
    query = query.sort(options.sort);
  }
  const populates = (options.populate || "").split(",").map((s) => s.trim()).filter(Boolean);
  // Always populate cancelledBy name for cancel details
  if (!populates.includes("cancelledBy")) {
    populates.push("cancelledBy");
  }
  for (const field of populates) {
    const fields =
      field === "cancelledBy"
        ? "name avatar"
        : field === "postedBy"
          ? "name avatar"
          : field === "assignedTo"
            ? "name avatar"
            : undefined;
    query = query.populate(field, fields);
  }
  const docs = await query.exec();
  return docs.map((doc) => {
    const obj = resolveJobImages(doc) as any;
    // Helper-facing safety: never send raw coords; shorten long addresses.
    if (typeof obj.address === "string" && obj.address.includes(",")) {
      const parts = obj.address
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (parts.length >= 3) {
        obj.addressPublic = parts.slice(0, 2).join(", ");
        obj.address = obj.addressPublic;
      }
    }
    // Strip GeoJSON from list payloads so clients cannot render lat/lng.
    delete obj.location;
    return obj;
  });
};

export const JobRepository = {
  create,
  findById,
  findAll,
  findMany,
  updateById,
  deleteById,
  findNearby,
  claimOpenJob,
  transitionInProgressToCompleted,
  markEscrowCredited,
  markCashReceived,
  transitionToCancelled,
  markPendingPaymentOpen,
  countByStatus,
  findCancellations,
  appendHistory,
};
