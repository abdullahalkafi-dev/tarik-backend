import { Schema, model } from "mongoose";
import { AuthProvider, AuthRole, AuthStatus, TAuth } from "./auth.interface";
import bcrypt from "bcryptjs";
import config from "config";

const authSchema = new Schema<any>(
  {
    email: { type: String, sparse: true },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      required: function (this: any) {
        return this.loginProvider === AuthProvider.PHONE;
      },
    },
    password: { type: String, select: false },
    loginProvider: {
      type: String,
      enum: Object.values(AuthProvider),
      default: AuthProvider.PHONE,
    },
    role: {
      type: String,
      enum: Object.values(AuthRole),
      default: AuthRole.USER,
    },
    status: {
      type: String,
      enum: Object.values(AuthStatus),
      default: AuthStatus.PENDING,
    },
    isSuperAdmin: { type: Boolean, default: false },
    permissions: { type: [String], default: ["*"] },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    isBlacklisted: { type: Boolean, default: false },
    blacklistedReason: { type: String },
    blacklistedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    googleId: { type: String },
    lastLogin: { type: Date },
  },
  { timestamps: true },
);

// Hash password before saving
authSchema.pre("save", async function (this: any) {
  if (!this.isModified("password")) return;
  if (!this.password) return;
  const saltRounds = Number(config.bcrypt_salt_rounds);
  this.password = await bcrypt.hash(this.password, saltRounds);
});

export const Auth = model<TAuth>("Auth", authSchema as any);

export const syncAuthIndexes = () => Auth.syncIndexes();
