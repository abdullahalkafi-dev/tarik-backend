import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { Types } from "mongoose";
import { AuthRepository } from "./auth.repository";
import { UserRepository } from "module/user/user.repository";
import { TAuth, AuthStatus, AuthProvider, AuthRole } from "./auth.interface";
import { Session } from "./session.model";
import createJwtToken from "jwt/createJwtToken";
import verifyJwtToken from "jwt/verifyJwtToken";
import config from "config";
import { resolveUrl } from "util/minio";
import { Secret } from "jsonwebtoken";
import redisClient from "redis/redisClient";
import bcrypt from "bcryptjs";
import { normalizeMoroccoPhone } from "util/moroccoPhone";
import { checkAndIncrementOtpRateLimit } from "util/otpRateLimiter";
import { LoginThrottle } from "util/loginThrottle";
import { parseDurationMs } from "util/duration";
import { logger } from "logger/logger";
import { notifyAdmins } from "util/notifyAdmins";
import { disconnectUserSockets } from "../../socket/socket.gateway";

const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes TTL
const PHONE_OTP_KEY_PREFIX = "otp:phone";
// Demo/testing code until the real WhatsApp provider is connected (owner decision 2026-10-27).
const FIXED_TEST_OTP = "123456";
const MIN_PASSWORD_LENGTH = 8;

const ADMIN_ROLES: string[] = [AuthRole.ADMIN, AuthRole.STAFF, AuthRole.SUPER_ADMIN];

type TPhoneRegisterPayload = {
  phone: string;
  password: string;
  name: string;
  role?: string;
};

const maskPhone = (phone: string) => (phone.length > 6 ? `${phone.slice(0, 5)}***${phone.slice(-2)}` : "***");

const refreshLifetimeMs = () => parseDurationMs(config.jwt.jwt_refresh_expire_in, 30 * 86_400_000);

// ─── Tokens & sessions ──────────────────────────────────
const buildTokenPayload = (auth: TAuth, userId: string, sid: string) => ({
  userId,
  authId: String(auth._id),
  email: auth.email,
  phone: auth.phone,
  role: auth.role,
  isSuperAdmin: auth.isSuperAdmin,
  // Informational only: the API always re-reads role and permissions from the database.
  permissions: (auth as any).permissions || [],
  tv: auth.tokenVersion || 0,
  sid,
});

/**
 * Create (or extend) the device session and sign a fresh access + refresh pair.
 * The refresh token is re-issued on every refresh, so an active user stays
 * logged in while a revoked session or bumped tokenVersion ends it for real.
 */
const generateTokens = async (
  auth: TAuth,
  userId: string,
  options: { sid?: string; userAgent?: string } = {},
) => {
  const expiresAt = new Date(Date.now() + refreshLifetimeMs());
  let sid = options.sid;

  if (sid) {
    await Session.updateOne({ _id: sid }, { $set: { expiresAt, lastUsedAt: new Date() } });
  } else {
    const session = await Session.create({
      auth: auth._id,
      userAgent: options.userAgent?.slice(0, 300),
      expiresAt,
    });
    sid = String(session._id);
  }

  const payload = buildTokenPayload(auth, userId, sid);

  const accessToken = createJwtToken(
    payload,
    config.jwt.jwt_secret as string,
    config.jwt.jwt_expire_in,
  );

  const refreshToken = createJwtToken(
    { authId: payload.authId, userId, tv: payload.tv, sid },
    config.jwt.jwt_refresh_secret as string,
    config.jwt.jwt_refresh_expire_in,
  );

  return { accessToken, refreshToken };
};

const revokeAllSessions = async (authId: string) => {
  await bumpTokenVersion(authId);
  await Session.deleteMany({ auth: authId });
};

/** Invalidate every token ever issued for this account (they all carry the old version). */
const bumpTokenVersion = async (authId: string) => {
  await AuthRepository.updateById(authId, { $inc: { tokenVersion: 1 } });
};

const assertPasswordStrength = (password: string) => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      { code: "PASSWORD_TOO_SHORT", params: { min: MIN_PASSWORD_LENGTH } },
    );
  }
};

const assertAccountUsable = (auth: TAuth, user: { isBlocked?: boolean } | null) => {
  if (auth.isBlacklisted) {
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been permanently suspended.");
  }
  if (auth.status === AuthStatus.SUSPENDED) {
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been suspended.");
  }
  if (!user || user.isBlocked) {
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been suspended.");
  }
};

// ─── Login (e-mail + password: admin / staff only) ─────
const login = async (
  payload: { email: string; password: string },
  meta: { userAgent?: string } = {},
) => {
  const email = payload.email.trim().toLowerCase();
  const { password } = payload;

  await LoginThrottle.assertNotLocked("email", email);

  const auth = await AuthRepository.findOne(
    { email, isDeleted: false },
    { select: "+password" },
  );

  // Same message and same cost for "no such account", "not an admin" and "wrong password".
  const invalid = new AppError(StatusCodes.UNAUTHORIZED, "Invalid email or password");

  if (!auth || !auth.isEmailVerified || !ADMIN_ROLES.includes(auth.role) || !auth.password) {
    await bcrypt.compare(password, "$2a$08$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv0");
    await LoginThrottle.registerFailure("email", email);
    throw invalid;
  }

  const isPasswordValid = await bcrypt.compare(password, auth.password);
  if (!isPasswordValid) {
    await LoginThrottle.registerFailure("email", email);
    throw invalid;
  }

  const user = await UserRepository.findOne({ auth: auth._id });
  assertAccountUsable(auth, user);
  await LoginThrottle.clear("email", email);

  await AuthRepository.updateById(String(auth._id), { lastLogin: new Date() });

  const tokens = await generateTokens(auth, String(user!._id), meta);

  return {
    ...tokens,
    user: {
      _id: user!._id,
      name: user!.name,
      email: user!.email,
      avatar: resolveUrl(user!.avatar),
      role: auth.role,
      isSuperAdmin: auth.isSuperAdmin,
      permissions: auth.isSuperAdmin ? ["*"] : (auth as any).permissions || [],
      status: auth.status,
      mustChangePassword: !!auth.mustChangePassword,
    },
  };
};

// ─── Refresh Token ──────────────────────────────────────
const getAccessToken = async (refreshToken: string, meta: { userAgent?: string } = {}) => {
  const decoded = verifyJwtToken(refreshToken, config.jwt.jwt_refresh_secret as Secret);

  const auth = await AuthRepository.findById(decoded.authId);
  if (!auth || auth.isDeleted || auth.isBlacklisted || auth.status === AuthStatus.SUSPENDED) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token");
  }

  if ((decoded.tv ?? 0) !== (auth.tokenVersion ?? 0)) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Session expired. Please log in again.");
  }

  const user = await UserRepository.findOne({ auth: auth._id });
  if (!user || user.isBlocked || user.isDeleted) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token");
  }

  let sid: string | undefined;
  if (decoded.sid) {
    const session = await Session.findById(decoded.sid);
    if (!session || String(session.auth) !== String(auth._id)) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Session expired. Please log in again.");
    }
    sid = String(session._id);
  }
  // Tokens issued before sessions existed carry no sid: upgrade them in place.

  return generateTokens(auth, String(user._id), { sid, userAgent: meta.userAgent });
};

// ─── Logout ─────────────────────────────────────────────
const logout = async (sid?: string) => {
  if (sid) {
    await Session.deleteOne({ _id: sid });
  }
  return { message: "Logged out" };
};

const logoutAll = async (authId: string) => {
  await revokeAllSessions(authId);
  return { message: "Logged out from all devices" };
};

// ─── Change password (logged-in users and admins) ───────
const changePassword = async (
  authId: string,
  userId: string,
  currentPassword: string,
  newPassword: string,
  meta: { userAgent?: string } = {},
) => {
  assertPasswordStrength(newPassword);

  const auth = await AuthRepository.findById(authId, { select: "+password" });
  if (!auth || auth.isDeleted) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  const ok = auth.password ? await bcrypt.compare(currentPassword, auth.password) : false;
  if (!ok) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Current password is incorrect", {
      code: "WRONG_CURRENT_PASSWORD",
    });
  }
  if (currentPassword === newPassword) {
    throw new AppError(StatusCodes.BAD_REQUEST, "The new password must be different", {
      code: "SAME_PASSWORD",
    });
  }

  auth.password = newPassword; // hashed by pre-save hook
  auth.mustChangePassword = false;
  await auth.save();

  // Every other device is logged out; this device gets a fresh session.
  await revokeAllSessions(authId);
  const fresh = await AuthRepository.findById(authId);
  const tokens = await generateTokens(fresh as TAuth, userId, meta);
  disconnectUserSockets(userId);

  return { message: "Password changed successfully", ...tokens };
};

// ─── Phone OTP Helpers ─────────────────────────────────
const storePhoneOtp = async (phone: string, type: string, otp: string) => {
  const key = `${PHONE_OTP_KEY_PREFIX}:${phone}:${type}`;
  await redisClient.set(key, otp, OTP_EXPIRY_SECONDS);
};

const verifyStoredPhoneOtp = async (phone: string, type: string, otp: string): Promise<boolean> => {
  const key = `${PHONE_OTP_KEY_PREFIX}:${phone}:${type}`;
  const stored = await redisClient.get(key);
  // Demo mode: the fixed code (or the stored one) is accepted until a real provider exists.
  if (!stored && otp !== FIXED_TEST_OTP) {
    logger.warn(`[PHONE OTP] no stored code for ${maskPhone(phone)}`);
    return false;
  }
  if (stored && stored !== otp && otp !== FIXED_TEST_OTP) {
    logger.warn(`[PHONE OTP] mismatch for ${maskPhone(phone)}`);
    return false;
  }
  await redisClient.delete(key);
  return true;
};

// ─── Phone Register ─────────────────────────────────────
const registerWithPhone = async (payload: TPhoneRegisterPayload) => {
  const normalizedPhone = normalizeMoroccoPhone(payload.phone);
  const { password, role } = payload;
  const name = payload.name.trim();
  assertPasswordStrength(password);
  logger.info(`[PHONE REGISTER] ${maskPhone(normalizedPhone)} role=${role || "user"}`);

  // 1. Blacklist check
  const blacklisted = await AuthRepository.findOne({
    phone: normalizedPhone,
    isBlacklisted: true,
  });
  if (blacklisted) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "This phone number has been permanently blacklisted due to security policy violations.",
    );
  }

  // 2. Check if verified account exists
  const existingVerified = await AuthRepository.findOne({
    phone: normalizedPhone,
    isPhoneVerified: true,
    isDeleted: false,
  });
  if (existingVerified) {
    throw new AppError(StatusCodes.CONFLICT, "Phone number is already registered. Please log in.", {
      code: "PHONE_ALREADY_REGISTERED",
    });
  }

  // 3. Rate limit before touching any data
  await checkAndIncrementOtpRateLimit(normalizedPhone);

  // 4. Replace an earlier unverified attempt for the same number
  const existingUnverified = await AuthRepository.findOne({
    phone: normalizedPhone,
    isPhoneVerified: false,
    isDeleted: false,
  });
  if (existingUnverified) {
    await UserRepository.deleteMany({ auth: existingUnverified._id });
    await AuthRepository.deleteById(String(existingUnverified._id));
  }

  // 5. Create auth record (password hashed by pre-save hook)
  const auth = await AuthRepository.create({
    phone: normalizedPhone,
    password,
    loginProvider: AuthProvider.PHONE,
    role: (role === "helper" ? AuthRole.HELPER : AuthRole.USER) as any,
    isPhoneVerified: false,
    status: AuthStatus.PENDING,
  });

  // 6. Create user record
  await UserRepository.create({
    auth: new Types.ObjectId(auth._id),
    name,
    phone: normalizedPhone,
  });

  // 7. Store the verification code (demo: fixed code)
  await storePhoneOtp(normalizedPhone, "verify", FIXED_TEST_OTP);

  return {
    status: "unverified",
    phone: normalizedPhone,
    message: "WhatsApp verification code sent successfully",
  };
};

// ─── Verify Phone OTP ───────────────────────────────────
const verifyPhoneOtp = async (phone: string, otp: string, meta: { userAgent?: string } = {}) => {
  const normalizedPhone = normalizeMoroccoPhone(phone);

  const valid = await verifyStoredPhoneOtp(normalizedPhone, "verify", otp);
  if (!valid) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired WhatsApp OTP code", {
      code: "INVALID_OTP",
    });
  }

  const auth = await AuthRepository.findOne({ phone: normalizedPhone, isDeleted: false });
  if (!auth) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  if (auth.isBlacklisted) {
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been permanently blacklisted.");
  }

  // Mark as verified and active
  await AuthRepository.updateById(String(auth._id), {
    isPhoneVerified: true,
    status: AuthStatus.ACTIVE,
  });

  const user = await UserRepository.findOne({ auth: auth._id });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  if (user.isBlocked) {
    throw new AppError(StatusCodes.FORBIDDEN, "Account has been suspended");
  }

  const tokens = await generateTokens(auth, String(user._id), meta);

  // First verification of this account = a new registration (admin alert, if switched on).
  if (!auth.isPhoneVerified) {
    notifyAdmins(
      "New registration",
      `${user.name} joined as ${auth.role === AuthRole.HELPER ? "helper" : "client"}`,
      { type: "new_registration", userId: String(user._id) },
      "users.view",
      "newUserRegistrations",
    ).catch(() => undefined);
  }

  return {
    ...tokens,
    user: {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: auth.role,
      status: AuthStatus.ACTIVE,
      isPhoneVerified: true,
      helperApplicationStatus: user.helperApplicationStatus,
    },
  };
};

// ─── Resend Phone OTP ───────────────────────────────────
const resendPhoneOtp = async (phone: string) => {
  const normalizedPhone = normalizeMoroccoPhone(phone);
  const auth = await AuthRepository.findOne({ phone: normalizedPhone, isDeleted: false });
  if (!auth) {
    throw new AppError(StatusCodes.NOT_FOUND, "No account found");
  }

  if (auth.isBlacklisted) {
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been permanently blacklisted.");
  }

  if (auth.isPhoneVerified) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Phone number is already verified");
  }

  await checkAndIncrementOtpRateLimit(normalizedPhone);
  await storePhoneOtp(normalizedPhone, "verify", FIXED_TEST_OTP);

  return { message: "WhatsApp verification code resent" };
};

// ─── Phone Login ────────────────────────────────────────
const loginWithPhone = async (
  payload: { phone: string; password: string; loginAs?: string },
  meta: { userAgent?: string } = {},
) => {
  const normalizedPhone = normalizeMoroccoPhone(payload.phone);
  const { password } = payload;

  await LoginThrottle.assertNotLocked("phone", normalizedPhone);

  const auth = await AuthRepository.findOne(
    { phone: normalizedPhone, isDeleted: false },
    { select: "+password" },
  );

  const invalid = new AppError(StatusCodes.UNAUTHORIZED, "Invalid phone number or password", {
    code: "INVALID_CREDENTIALS",
  });

  if (!auth) {
    // Burn the same time as a real comparison so account existence is not observable.
    await bcrypt.compare(password, "$2a$08$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv0");
    await LoginThrottle.registerFailure("phone", normalizedPhone);
    throw invalid;
  }

  const isPasswordValid = await bcrypt.compare(password, auth.password || "");
  if (!isPasswordValid) {
    await LoginThrottle.registerFailure("phone", normalizedPhone);
    throw invalid;
  }

  if (auth.isBlacklisted) {
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been permanently suspended.");
  }

  const user = await UserRepository.findOne({ auth: auth._id });
  assertAccountUsable(auth, user);
  await LoginThrottle.clear("phone", normalizedPhone);

  if (!auth.isPhoneVerified) {
    await checkAndIncrementOtpRateLimit(normalizedPhone);
    await storePhoneOtp(normalizedPhone, "verify", FIXED_TEST_OTP);
    return {
      status: "unverified",
      phone: normalizedPhone,
      isPhoneVerified: false,
      message: "Please verify your phone number. A WhatsApp OTP has been sent.",
    };
  }

  await AuthRepository.updateById(String(auth._id), { lastLogin: new Date() });

  const tokens = await generateTokens(auth, String(user!._id), meta);

  return {
    ...tokens,
    user: {
      _id: user!._id,
      name: user!.name,
      phone: user!.phone,
      email: user!.email,
      avatar: resolveUrl(user!.avatar),
      role: auth.role,
      status: auth.status,
      isPhoneVerified: true,
      helperApplicationStatus: user!.helperApplicationStatus,
    },
  };
};

// ─── Forgot Password (Phone) ────────────────────────────
const forgotPasswordPhone = async (phone: string) => {
  const normalizedPhone = normalizeMoroccoPhone(phone);

  // The limit applies to every number, registered or not, so the response
  // pattern never reveals whether an account exists.
  await checkAndIncrementOtpRateLimit(normalizedPhone);

  const auth = await AuthRepository.findOne({
    phone: normalizedPhone,
    isDeleted: false,
    isPhoneVerified: true,
  });

  if (auth) {
    await storePhoneOtp(normalizedPhone, "reset", FIXED_TEST_OTP);
  }

  return { message: "If an account exists, a WhatsApp reset code has been sent." };
};

// ─── Verify Reset OTP (Phone) ───────────────────────────
const verifyResetOtpPhone = async (phone: string, otp: string) => {
  const normalizedPhone = normalizeMoroccoPhone(phone);
  const valid = await verifyStoredPhoneOtp(normalizedPhone, "reset", otp);
  if (!valid) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired reset OTP code", {
      code: "INVALID_OTP",
    });
  }

  const auth = await AuthRepository.findOne({ phone: normalizedPhone, isDeleted: false });
  if (!auth) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  // The reset token is bound to the current tokenVersion: it dies as soon as the
  // password is changed (single use) or any other revocation event happens.
  const resetToken = createJwtToken(
    { authId: String(auth._id), phone: auth.phone, type: "password_reset", tv: auth.tokenVersion || 0 },
    config.jwt.jwt_secret as string,
    "10m",
  );

  return { resetToken };
};

// ─── Reset Password (Phone) ─────────────────────────────
const resetPasswordPhone = async (resetToken: string, newPassword: string) => {
  const decoded = verifyJwtToken(resetToken, config.jwt.jwt_secret as Secret);

  if (decoded.type !== "password_reset") {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid reset token");
  }
  assertPasswordStrength(newPassword);

  const auth = await AuthRepository.findById(decoded.authId);
  if (!auth || auth.isDeleted) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  if ((decoded.tv ?? 0) !== (auth.tokenVersion ?? 0)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This reset link has already been used or has expired", {
      code: "RESET_TOKEN_USED",
    });
  }

  auth.password = newPassword;
  await auth.save();

  // Single use + every old session ends.
  await revokeAllSessions(String(auth._id));
  if (auth.phone) await LoginThrottle.clear("phone", auth.phone);
  const user = await UserRepository.findOne({ auth: auth._id });
  if (user) disconnectUserSockets(String(user._id));

  return { message: "Password reset successful" };
};

export const AuthService = {
  login,
  getAccessToken,
  logout,
  logoutAll,
  changePassword,
  // Phone auth
  registerWithPhone,
  verifyPhoneOtp,
  resendPhoneOtp,
  loginWithPhone,
  forgotPasswordPhone,
  verifyResetOtpPhone,
  resetPasswordPhone,
};

export { revokeAllSessions, generateTokens };
