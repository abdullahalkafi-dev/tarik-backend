import { resolveUrl } from "util/minio";
import { approximateAddress, approximateCoordinates, haversineKm, roundKm } from "util/geo";
import { ACTIVE_JOB_STATUSES, JobStatus } from "./job.interface";

/**
 * What each kind of viewer may see about a job.
 *
 *  - public  : any helper browsing open jobs. Area-level address, blurred
 *              coordinates, no phone / e-mail. (The client's contact details and
 *              exact home are never part of a job list or a push.)
 *  - participant : the client who posted it, or the assigned helper. Full address
 *              and coordinates; the other party's phone only while the work is
 *              active. No e-mail ever.
 *  - staff   : everything (admin dashboard).
 */

const imagesOf = (obj: any) => (obj.images || []).map(resolveUrl).filter(Boolean);

const idOf = (v: any) => String(v?._id ?? v ?? "");

const userBrief = (u: any, extra: Record<string, unknown> = {}) => {
  if (!u || typeof u !== "object" || !("name" in u)) return u;
  return {
    _id: u._id,
    name: u.name,
    avatar: resolveUrl(u.avatar),
    rating: u.rating,
    reviewCount: u.reviewCount,
    ...extra,
  };
};

const categoryOf = (c: any) =>
  c && typeof c === "object" && "name" in c
    ? { _id: c._id, name: c.name, slug: c.slug, names: c.names, icon: resolveUrl(c.icon) }
    : c;

const BASE_FIELDS = [
  "_id",
  "title",
  "description",
  "date",
  "startTime",
  "endTime",
  "startAt",
  "endAt",
  "budget",
  "budgetType",
  "hourlyRate",
  "hours",
  "paymentMethod",
  "paymentStatus",
  "status",
  "isCustomOffer",
  "createdAt",
  "updatedAt",
] as const;

const pick = (obj: any) => {
  const out: Record<string, unknown> = {};
  for (const k of BASE_FIELDS) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
};

export const toPublicJob = (jobObj: any, viewer?: { latitude?: number; longitude?: number }) => {
  const obj = jobObj?.toObject ? jobObj.toObject() : jobObj;
  const coords = obj.location?.coordinates;
  const hasCoords = Array.isArray(coords) && coords.length >= 2;

  let distanceKm: number | undefined;
  if (hasCoords && viewer?.latitude != null && viewer?.longitude != null) {
    distanceKm = roundKm(haversineKm(viewer.latitude, viewer.longitude, coords[1], coords[0]));
  }

  return {
    ...pick(obj),
    images: imagesOf(obj),
    category: categoryOf(obj.category),
    postedBy: userBrief(obj.postedBy),
    address: approximateAddress(obj.address),
    location: hasCoords
      ? { type: "Point", coordinates: approximateCoordinates([coords[0], coords[1]], idOf(obj._id)) }
      : undefined,
    locationApproximate: true,
    ...(distanceKm !== undefined ? { distanceKm } : {}),
  };
};

const isActive = (status: JobStatus) => ACTIVE_JOB_STATUSES.includes(status);

const COMPLETE_FIELDS = [
  "commissionDeducted",
  "feePercentage",
  "helperNet",
  "acceptedAt",
  "onTheWayAt",
  "arrivedAt",
  "helperFinishedAt",
  "autoCompleteAt",
  "disputeOpen",
  "cancellationReason",
  "cancellationCode",
  "cancelledByRole",
  "cancelledAt",
  "completedAt",
  "refundStatus",
  "history",
] as const;

export const toParticipantJob = (jobObj: any, viewerId: string) => {
  const obj = jobObj?.toObject ? jobObj.toObject() : jobObj;
  const isOwner = idOf(obj.postedBy) === String(viewerId);
  const active = isActive(obj.status);

  const out: Record<string, unknown> = {
    ...pick(obj),
    images: imagesOf(obj),
    category: categoryOf(obj.category),
    address: obj.address,
    location: obj.location,
    cancelledBy: userBrief(obj.cancelledBy),
  };
  for (const k of COMPLETE_FIELDS) if (obj[k] !== undefined) out[k] = obj[k];

  // Counterpart contact: phone only while the job is active; never e-mail.
  const contact = (u: any) =>
    u && typeof u === "object" && "name" in u
      ? userBrief(u, active && u.phone ? { phone: u.phone } : {})
      : u;

  if (isOwner) {
    out.postedBy = userBrief(obj.postedBy, obj.postedBy?.phone ? { phone: obj.postedBy.phone } : {});
    out.assignedTo =
      obj.assignedTo && typeof obj.assignedTo === "object" && "name" in obj.assignedTo
        ? {
            ...contact(obj.assignedTo),
            pricePerHour: obj.assignedTo.pricePerHour,
            experience: obj.assignedTo.experience,
            bio: obj.assignedTo.bio,
            city: obj.assignedTo.city,
          }
        : obj.assignedTo;
  } else {
    out.postedBy = contact(obj.postedBy);
    out.assignedTo = userBrief(
      obj.assignedTo,
      obj.assignedTo?.phone ? { phone: obj.assignedTo.phone } : {},
    );
  }
  return out;
};

/** Admin dashboard: full record. */
export const toStaffJob = (jobObj: any) => {
  const obj = jobObj?.toObject ? jobObj.toObject() : { ...jobObj };
  return {
    ...obj,
    images: imagesOf(obj),
    postedBy:
      obj.postedBy && typeof obj.postedBy === "object" && "name" in obj.postedBy
        ? { ...obj.postedBy, avatar: resolveUrl(obj.postedBy.avatar) }
        : obj.postedBy,
    assignedTo:
      obj.assignedTo && typeof obj.assignedTo === "object" && "name" in obj.assignedTo
        ? { ...obj.assignedTo, avatar: resolveUrl(obj.assignedTo.avatar) }
        : obj.assignedTo,
    category: categoryOf(obj.category),
  };
};
