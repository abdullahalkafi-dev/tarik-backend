import { Schema, model } from "mongoose";
import { TPlatformSettings } from "./settings.interface";

const platformSettingsSchema = new Schema<TPlatformSettings>(
  {
    platformName: { type: String, default: "3awniNet" },
    supportEmail: { type: String, default: "support@3awninet.ma" },
    contactPhone: { type: String, default: "+212 522 00 00 00" },
    platformFeePercentage: { type: Number, default: 20 },
    minimumServiceAmount: { type: Number, default: 30 },
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
    },
  },
  { timestamps: true }
);

export const PlatformSettings = model<TPlatformSettings>(
  "PlatformSettings",
  platformSettingsSchema
);
