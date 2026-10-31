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
    deviceTokens: [
      {
        _id: false,
        token: { type: String, required: true },
        platform: { type: String, enum: ["android", "ios"], default: "android" },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    locale: { type: String, enum: ["ar", "fr", "en", "es"], default: "fr" },
    notificationPrefs: {
      push: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
      vibrate: { type: Boolean, default: true },
      payments: { type: Boolean, default: true },
      appUpdates: { type: Boolean, default: true },
      newService: { type: Boolean, default: true },
    },
    isAvailable: { type: Boolean, default: true },
    lastKnownLocation: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number] },
    },
    lastKnownLocationAt: { type: Date },
    acceptedLegalVersion: { type: Number },
    acceptedLegalAt: { type: Date },
    cancelStrikes: { type: Number, default: 0 },
    cancelStrikeUntil: { type: Date },

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
    age: { type: Number, min: 18, max: 100 },
    city: { type: String },
    language: { type: String },
    serviceType: { type: Schema.Types.ObjectId, ref: "Category" },
    pricePerHour: { type: Number, min: 0, max: 2000 },
    experience: { type: Number, min: 0, max: 60 },
    serviceRadius: { type: Number, min: 0.5, max: 60 },
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
      dateOfBirth: { type: String },
      documentExpiry: { type: String },
      issuingCountry: { type: String },
      nameMatchScore: { type: Number },
      warnings: [{ type: String }],
    },
    diditSessionCount: { type: Number, default: 0 },
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
    blockedReason: { type: String, maxlength: 500 },
    blockedAt: { type: Date },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// 2dsphere index for geo queries
userSchema.index({ location: "2dsphere" });
userSchema.index({ "deviceTokens.token": 1 });
userSchema.index({ deviceToken: 1 }, { sparse: true });
userSchema.index({ helperApplicationStatus: 1, isBlocked: 1, isDeleted: 1, serviceType: 1 });
// MongoDB treats a document field named `language` as the text-index language
// override; helpers store free text there ("Arabic, French"), which Mongo
// rejects. Point the override at an unused field and don't stem names.
userSchema.index(
  { name: "text" },
  { language_override: "textSearchLanguage", default_language: "none" },
);

export const User = model<TUser>("User", userSchema);

export const syncUserIndexes = () => User.syncIndexes();
