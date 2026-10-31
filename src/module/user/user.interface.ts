import { Types } from "mongoose";

export enum HelperApplicationStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  PENDING_APPEAL = "pending_appeal",
}

export enum DocumentType {
  NID = "nid",
  PASSPORT = "passport",
  DRIVING_LICENSE = "driving_license",
  RESIDENCE_PERMIT = "residence_permit",
}

export interface TUserLocation {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface TApplicationHistory {
  appliedAt: Date;
  status: HelperApplicationStatus;
  rejectionReason?: string;
  reviewedAt?: Date;
}

export interface TAdminActionHistory {
  action: string;
  adminId: Types.ObjectId;
  reason?: string;
  previousStatus?: string;
  newStatus?: string;
  timestamp: Date;
}

export interface TUser {
  _id: Types.ObjectId;
  auth: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  coverPhoto?: string;
  bio?: string;
  role?: string;
  rating?: number;
  reviewCount?: number;

  // Location
  location?: TUserLocation;
  address?: string;
  deviceToken?: string | null;
  deviceTokenPlatform?: "android" | "ios";
  deviceTokenUpdatedAt?: Date;
  /** Every device the user is logged in on (push goes to all of them). */
  deviceTokens?: { token: string; platform: "android" | "ios"; updatedAt: Date }[];
  /** Language of the app (ar | fr | en | es) so the server can write push texts in it. */
  locale?: string;
  notificationPrefs?: {
    push: boolean;
    sound: boolean;
    vibrate: boolean;
    payments: boolean;
    appUpdates: boolean;
    newService: boolean;
  };
  /** Helper availability: only available helpers are shown as "available now" and notified. */
  isAvailable?: boolean;
  /** Last GPS position reported by the helper app (rate-limited), used to rank nearby jobs. */
  lastKnownLocation?: TUserLocation;
  lastKnownLocationAt?: Date;
  /** Terms/privacy version the user accepted. */
  acceptedLegalVersion?: number;
  acceptedLegalAt?: Date;
  /** Cancellation strikes for the cancellation policy. */
  cancelStrikes?: number;
  cancelStrikeUntil?: Date;

  // Helper fields
  isHelperFormSubmitted: boolean;
  helperApplicationStatus: HelperApplicationStatus | null;
  rejectionReason?: string;
  applicationHistory: TApplicationHistory[];
  age?: number;
  city?: string;
  language?: string;
  serviceType?: Types.ObjectId;
  pricePerHour?: number;
  experience?: number;
  serviceRadius?: number;
  profilePhotos?: string[];
  documentType?: DocumentType;
  documentUrl?: string;
  selfieUrl?: string;

  // Didit Automated KYC fields
  diditSessionId?: string;
  diditStatus?: string;
  diditDecisionReason?: string;
  diditDiagnostics?: {
    faceMatchScore?: number;
    livenessScore?: number;
    livenessPassed?: boolean;
    ocrName?: string;
    dateOfBirth?: string;
    documentExpiry?: string;
    issuingCountry?: string;
    nameMatchScore?: number;
    warnings?: string[];
  };
  diditSessionCount?: number;
  documentNumberHash?: string;
  maskedDocumentNumber?: string;

  // Appeal fields
  appealStatus?: "none" | "pending" | "approved" | "rejected" | "max_exceeded";
  appealCount: number;
  appealMessage?: string;
  appealedAt?: Date;

  // Audit History
  adminActionHistory: TAdminActionHistory[];

  isDeleted: boolean;
  isBlocked: boolean;
  blockedReason?: string;
  blockedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
