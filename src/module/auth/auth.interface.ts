import { Types } from "mongoose";

export enum AuthProvider {
  EMAIL = "email",
  GOOGLE = "google",
  PHONE = "phone",
}

export enum AuthRole {
  USER = "user",
  HELPER = "helper",
  ADMIN = "admin",
  SUPER_ADMIN = "superAdmin",
  STAFF = "staff",
}

export enum AuthStatus {
  PENDING = "pending",
  ACTIVE = "active",
  SUSPENDED = "suspended",
}

export interface TAuth {
  _id: Types.ObjectId;
  email?: string;
  phone?: string;
  password?: string;
  loginProvider: AuthProvider;
  role: AuthRole;
  status: AuthStatus;
  isSuperAdmin: boolean;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isBlacklisted: boolean;
  blacklistedReason?: string;
  blacklistedAt?: Date;
  isDeleted: boolean;
  googleId?: string;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}
