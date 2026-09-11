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
    warnings?: string[];
  };
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
  createdAt: Date;
  updatedAt: Date;
}
