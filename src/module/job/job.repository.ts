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
    cancelledBy: obj.cancelledBy && typeof obj.cancelledBy === "object" && "name" in obj.cancelledBy
      ? { ...obj.cancelledBy, avatar: resolveUrl(obj.cancelledBy.avatar) }
      : obj.cancelledBy,
  };
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

/**
 * Raw populated job. WHAT the caller may see is decided by job.serializer.ts —
 * never send this object to a client directly.
 */
const findDetailsById = async (id: string | Types.ObjectId) => {
  const doc = await Job.findById(id)
    .populate("postedBy", "name phone email avatar address city rating reviewCount")
    .populate("assignedTo", "name phone email avatar address city rating reviewCount pricePerHour experience bio")
    .populate("category", "name slug names icon")
    .populate("cancelledBy", "name avatar")
    .exec();
  if (!doc) return null;
  return doc;
};

/** Staff listing (dashboard). */
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
      .populate("category", "name slug names icon")
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
  data: Partial<TJob> | Record<string, unknown>,
) => {
  return Job.findByIdAndUpdate(id, data as any, { returnDocument: "after", runValidators: true }).exec();
};

/**
 * Atomically claim an OPEN job for a helper.
 * Returns null if already taken / not open. The fee in force and the resulting
 * amounts are frozen on the job at this moment.
 */
const claimOpenJob = async (
  jobId: string | Types.ObjectId,
  helperId: string | Types.ObjectId,
  snapshot: { commission: number; feePercentage: number; helperNet: number },
) => {
  return Job.findOneAndUpdate(
    { _id: jobId, status: "open" } as any,
    {
      $set: {
        status: "in_progress",
        assignedTo: new Types.ObjectId(helperId),
        commissionDeducted: snapshot.commission,
        feePercentage: snapshot.feePercentage,
        helperNet: snapshot.helperNet,
        acceptedAt: new Date(),
      },
    },
    { returnDocument: "after", runValidators: true },
  ).exec();
};

/** Helper progress: in_progress → on_the_way. */
const markOnTheWay = async (jobId: string | Types.ObjectId, helperId: string) => {
  return Job.findOneAndUpdate(
    { _id: jobId, assignedTo: helperId, status: "in_progress" } as any,
    { $set: { status: "on_the_way", onTheWayAt: new Date() } },
    { returnDocument: "after" },
  ).exec();
};

/** Helper progress: in_progress | on_the_way → arrived. */
const markArrived = async (jobId: string | Types.ObjectId, helperId: string) => {
  return Job.findOneAndUpdate(
    { _id: jobId, assignedTo: helperId, status: { $in: ["in_progress", "on_the_way"] } } as any,
    { $set: { status: "arrived", arrivedAt: new Date() } },
    { returnDocument: "after" },
  ).exec();
};

/** Helper says the work is done: the client now has `confirmHours` to confirm. */
const markFinishedByHelper = async (
  jobId: string | Types.ObjectId,
  helperId: string,
  confirmHours: number,
) => {
  const now = new Date();
  return Job.findOneAndUpdate(
    {
      _id: jobId,
      assignedTo: helperId,
      status: { $in: ["in_progress", "on_the_way", "arrived"] },
      helperFinishedAt: { $exists: false },
    } as any,
    {
      $set: {
        helperFinishedAt: now,
        autoCompleteAt: new Date(now.getTime() + confirmHours * 3_600_000),
      },
    },
    { returnDocument: "after" },
  ).exec();
};

const setDispute = async (jobId: string | Types.ObjectId, open: boolean) => {
  return Job.findByIdAndUpdate(
    jobId,
    { $set: { disputeOpen: open }, ...(open ? { $unset: { autoCompleteAt: 1 } } : {}) },
    { returnDocument: "after" },
  ).exec();
};

/**
 * Atomically move an active job → COMPLETED.
 * Returns null if not active (already completed/cancelled).
 */
const transitionInProgressToCompleted = async (
  jobId: string | Types.ObjectId,
) => {
  return Job.findOneAndUpdate(
    { _id: jobId, status: { $in: ["in_progress", "on_the_way", "arrived"] } } as any,
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
      },
      $unset: { autoCompleteAt: 1 },
    },
    { returnDocument: "after" },
  ).exec();
};

/**
 * Mark escrow credited only once (prevents double wallet credit).
 */
const markEscrowCredited = async (jobId: string | Types.ObjectId) => {
  return Job.findOneAndUpdate(
    { _id: jobId, escrowCredited: { $ne: true } } as any,
    { $set: { escrowCredited: true } },
    { returnDocument: "after" },
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
    { returnDocument: "after" },
  ).exec();
};

/**
 * Atomically cancel a job that is not finished (winner does refunds).
 * Returns null if already completed/cancelled.
 */
const transitionToCancelled = async (
  jobId: string | Types.ObjectId,
  payload: {
    reason: string;
    cancelledBy?: string | Types.ObjectId;
    cancelledByRole?: "client" | "helper" | "admin" | "system";
    code?: string;
    refundStatus?: string;
    refundReference?: string;
  },
) => {
  return Job.findOneAndUpdate(
    {
      _id: jobId,
      status: { $in: ["open", "in_progress", "on_the_way", "arrived", "pending_payment"] },
    } as any,
    {
      $set: {
        status: "cancelled",
        cancellationReason: payload.reason,
        ...(payload.cancelledBy ? { cancelledBy: new Types.ObjectId(payload.cancelledBy) } : {}),
        ...(payload.cancelledByRole ? { cancelledByRole: payload.cancelledByRole } : {}),
        ...(payload.code ? { cancellationCode: payload.code } : {}),
        cancelledAt: new Date(),
        ...(payload.refundStatus ? { refundStatus: payload.refundStatus } : {}),
        ...(payload.refundReference
          ? { refundReference: payload.refundReference }
          : {}),
      },
      $unset: { autoCompleteAt: 1 },
    },
    { returnDocument: "after" },
  ).exec();
};

/**
 * Online payment: only OPEN if still PENDING_PAYMENT.
 */
const markPendingPaymentOpen = async (jobId: string | Types.ObjectId) => {
  return Job.findOneAndUpdate(
    { _id: jobId, status: "pending_payment" } as any,
    { $set: { status: "open" } },
    { returnDocument: "after" },
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
    on_the_way: 0,
    arrived: 0,
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
    const re = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [{ title: re }, { cancellationReason: re }];
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

  // Lifetime cancel counts — client vs helper separately (two grouped queries, not one per row)
  const userIds = new Set<string>();
  for (const job of docs) {
    const p = (job as any).postedBy?._id;
    const a = (job as any).assignedTo?._id;
    if (p) userIds.add(String(p));
    if (a) userIds.add(String(a));
  }
  const ids = [...userIds].map((id) => new Types.ObjectId(id));

  const [clientRows, helperRows] = await Promise.all([
    Job.aggregate([
      { $match: { status: "cancelled", postedBy: { $in: ids } } },
      { $group: { _id: "$postedBy", n: { $sum: 1 } } },
    ]),
    Job.aggregate([
      { $match: { status: "cancelled", assignedTo: { $in: ids } } },
      { $group: { _id: "$assignedTo", n: { $sum: 1 } } },
    ]),
  ]);
  const clientCounts = new Map<string, number>(clientRows.map((r) => [String(r._id), r.n]));
  const helperCounts = new Map<string, number>(helperRows.map((r) => [String(r._id), r.n]));

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
    { returnDocument: "after" },
  ).exec();
};

const deleteById = async (id: string | Types.ObjectId) => {
  return Job.findByIdAndDelete(id).exec();
};

/**
 * Open jobs around a point, nearest first, paginated. Callers shape the result
 * with job.serializer (public view: blurred position, no contact data).
 */
const findNearby = async (
  longitude: number,
  latitude: number,
  maxDistance: number = 10000,
  additionalFilter: FilterQuery<TJob> = {},
  options: QueryOptions = {},
) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const geoFilter: FilterQuery<TJob> = {
    ...additionalFilter,
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [longitude, latitude] },
        $maxDistance: maxDistance,
      },
    },
  };

  // $near can't be used in countDocuments; $geoWithin + $centerSphere gives the same set.
  const countFilter: FilterQuery<TJob> = {
    ...additionalFilter,
    location: {
      $geoWithin: {
        $centerSphere: [[longitude, latitude], maxDistance / 6378100],
      },
    },
  };

  const [docs, total] = await Promise.all([
    Job.find(geoFilter)
      .skip(skip)
      .limit(limit)
      .populate("postedBy", "name avatar rating reviewCount")
      .populate("category", "name slug names icon")
      .exec(),
    Job.countDocuments(countFilter).exec(),
  ]);

  return { docs, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const findMany = async (
  filter: FilterQuery<TJob> = {},
  options: { sort?: any; populate?: string; skip?: number; limit?: number } = {},
) => {
  let query = Job.find(filter);
  if (options.sort) {
    query = query.sort(options.sort);
  }
  if (options.skip) query = query.skip(options.skip);
  if (options.limit) query = query.limit(options.limit);
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
          ? "name avatar rating reviewCount"
          : field === "assignedTo"
            ? "name avatar rating reviewCount"
            : undefined;
    query = query.populate(field, fields);
  }
  const docs = await query.exec();
  return docs.map((doc) => resolveJobImages(doc) as any);
};

export const JobRepository = {
  create,
  findById,
  findDetailsById,
  findAll,
  findMany,
  updateById,
  deleteById,
  findNearby,
  claimOpenJob,
  markOnTheWay,
  markArrived,
  markFinishedByHelper,
  setDispute,
  transitionInProgressToCompleted,
  markEscrowCredited,
  markCashReceived,
  transitionToCancelled,
  markPendingPaymentOpen,
  countByStatus,
  findCancellations,
  appendHistory,
};
