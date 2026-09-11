import { Schema, model } from "mongoose";
import {
  NotificationAudience,
  TAppNotification,
} from "./notification.interface";

const notificationSchema = new Schema<TAppNotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    audience: {
      type: String,
      enum: Object.values(NotificationAudience),
      default: NotificationAudience.USER,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    data: { type: Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ audience: 1, createdAt: -1 });

export const AppNotification = model<TAppNotification>(
  "AppNotification",
  notificationSchema,
);
