import { Types } from "mongoose";

export enum NotificationAudience {
  USER = "user",
  ADMIN = "admin",
}

export interface TAppNotification {
  _id: Types.ObjectId;
  /** Target end-user (client/helper). For admin audience, the specific admin user if known. */
  user?: Types.ObjectId;
  audience: NotificationAudience;
  title: string;
  body: string;
  /** Deep-link payload — same shape as FCM data. */
  data: Record<string, string>;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
