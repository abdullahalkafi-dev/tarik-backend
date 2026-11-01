import { Schema, model } from "mongoose";
import { TPlatformSettings } from "./settings.interface";

const localized = {
  en: { type: String },
  fr: { type: String },
  ar: { type: String },
  es: { type: String },
};

const platformSettingsSchema = new Schema<TPlatformSettings>(
  {
    platformName: { type: String, default: "3awniNet" },
    supportEmail: { type: String, default: "support@3awninet.ma" },
    contactPhone: { type: String, default: "" },
    supportWhatsapp: { type: String, default: "" },
    // The fee applies to money movements; it is snapshotted on every job when
    // the helper accepts, so changing it never rewrites past jobs.
    platformFeePercentage: { type: Number, default: 20, min: 0, max: 50 },
    minimumServiceAmount: { type: Number, default: 30, min: 0, max: 100000 },
    minAppVersion: { type: String, default: "" },
    notifications: {
      newUserRegistrations: { type: Boolean, default: true },
      successfulPayments: { type: Boolean, default: true },
      customerServiceTickets: { type: Boolean, default: true },
    },
    legal: {
      termsOfService: {
        type: String,
        default: "Terms of Service — update from Admin → Settings → Legal.",
      },
      privacyPolicy: {
        type: String,
        default: "Privacy Policy — update from Admin → Settings → Legal.",
      },
      translations: {
        termsOfService: localized,
        privacyPolicy: localized,
      },
      version: { type: Number, default: 1 },
      effectiveDate: { type: Date },
    },
  },
  { timestamps: true },
);

export const PlatformSettings = model<TPlatformSettings>(
  "PlatformSettings",
  platformSettingsSchema,
);

/** Who changed which setting, when, from what to what. */
const settingsHistorySchema = new Schema(
  {
    changedBy: { type: Schema.Types.ObjectId, ref: "User" },
    changedByName: { type: String },
    changes: [
      {
        field: { type: String, required: true },
        oldValue: { type: Schema.Types.Mixed },
        newValue: { type: Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

settingsHistorySchema.index({ createdAt: -1 });

export const SettingsHistory = model("SettingsHistory", settingsHistorySchema);
