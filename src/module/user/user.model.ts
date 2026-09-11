import { Schema, model } from "mongoose";
import { TUser, HelperApplicationStatus, DocumentType } from "./user.interface";

const userSchema = new Schema<TUser>(
  {
    auth: { type: Schema.Types.ObjectId, ref: "Auth", required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String },
    phone: { type: String, unique: true, sparse: true },
    avatar: { type: String },
    coverPhoto: { type: String },
    bio: { type: String, maxlength: 500 },

    // Location
    location: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    address: { type: String },
    deviceToken: { type: String, default: null },
    deviceTokenPlatform: { type: String, enum: ["android", "ios"], default: "android" },
    deviceTokenUpdatedAt: { type: Date },

    // Helper fields
    isHelperFormSubmitted: { type: Boolean, default: false },
    helperApplicationStatus: {
      type: String,
      enum: Object.values(HelperApplicationStatus),
      default: null,
    },
    rejectionReason: { type: String },
    applicationHistory: [
      {
        appliedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: Object.values(HelperApplicationStatus),
        },
        rejectionReason: { type: String },
        reviewedAt: { type: Date },
      },
    ],
    age: { type: Number, min: 13 },
    city: { type: String },
    language: { type: String },
    serviceType: { type: Schema.Types.ObjectId, ref: "Category" },
    pricePerHour: { type: Number },
    experience: { type: Number },
    serviceRadius: { type: Number },
    profilePhotos: [{ type: String }],
    documentType: {
      type: String,
      enum: Object.values(DocumentType),
    },
    documentUrl: { type: String },
    selfieUrl: { type: String },

    // Didit Automated KYC fields
    diditSessionId: { type: String },
    diditStatus: { type: String },
    diditDecisionReason: { type: String },
    diditDiagnostics: {
      faceMatchScore: { type: Number },
      livenessScore: { type: Number },
      livenessPassed: { type: Boolean },
      ocrName: { type: String },
      warnings: [{ type: String }],
    },
    documentNumberHash: { type: String, index: true },
    maskedDocumentNumber: { type: String },

    // Appeal fields
    appealStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected", "max_exceeded"],
      default: "none",
    },
    appealCount: { type: Number, default: 0 },
    appealMessage: { type: String },
    appealedAt: { type: Date },

    // Admin audit history
    adminActionHistory: [
      {
        action: { type: String, required: true },
        adminId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        reason: { type: String },
        previousStatus: { type: String },
        newStatus: { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    isDeleted: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// 2dsphere index for geo queries
userSchema.index({ location: "2dsphere" });
userSchema.index({ name: "text" });

export const User = model<TUser>("User", userSchema);

export const syncUserIndexes = () => User.syncIndexes();
