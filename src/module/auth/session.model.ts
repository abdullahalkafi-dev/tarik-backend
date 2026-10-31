import { Schema, Types, model } from "mongoose";

/**
 * One row per logged-in device. The refresh token carries the session id, so
 * logging out (or an admin/password event) revokes the refresh token for real.
 */
export interface TSession {
  _id: Types.ObjectId;
  auth: Types.ObjectId;
  userAgent?: string;
  lastUsedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

const sessionSchema = new Schema<TSession>(
  {
    auth: { type: Schema.Types.ObjectId, ref: "Auth", required: true, index: true },
    userAgent: { type: String, maxlength: 300 },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Mongo removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<TSession>("Session", sessionSchema);
