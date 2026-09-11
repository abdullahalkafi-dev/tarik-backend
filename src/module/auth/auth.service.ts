import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { Types } from "mongoose";
import { AuthRepository } from "./auth.repository";
import { UserRepository } from "module/user/user.repository";
import { TAuth, AuthStatus, AuthProvider, AuthRole } from "./auth.interface";
import generateOTP from "util/generateOTP";
import createJwtToken from "jwt/createJwtToken";
import verifyJwtToken from "jwt/verifyJwtToken";
import config from "config";
import { resolveUrl } from "util/minio";
import { Secret } from "jsonwebtoken";
import redisClient from "redis/redisClient";
import { emailHelper } from "mail/emailHelper";
import emailTemplate from "mail/emailTemplate";
import bcrypt from "bcryptjs";
import { normalizeMoroccoPhone } from "util/moroccoPhone";
import { checkAndIncrementOtpRateLimit } from "util/otpRateLimiter";
import { logger } from "logger/logger";

const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes TTL
const OTP_KEY_PREFIX = "otp";
const PHONE_OTP_KEY_PREFIX = "otp:phone";
const FIXED_TEST_OTP = "123456";

type TRegisterPayload = {
  email: string;
  password: string;
  name: string;
  role?: string;
};

type TPhoneRegisterPayload = {
  phone: string;
  password: string;
  name: string;
  role?: string;
};

type TGoogleLoginPayload = {
  email: string;
  name: string;
  googleId: string;
  avatar?: string;
  role?: string;
};

const buildTokenPayload = (auth: TAuth, userId: string) => ({
  userId,
  authId: String(auth._id),
  email: auth.email,
  phone: auth.phone,
  role: auth.role,
  isSuperAdmin: auth.isSuperAdmin,
  permissions: (auth as any).permissions || ["*"],
});

const generateTokens = (auth: TAuth, userId: string) => {
  const payload = buildTokenPayload(auth, userId);

  const accessToken = createJwtToken(
    payload,
    config.jwt.jwt_secret as string,
    config.jwt.jwt_expire_in,
  );

  const refreshToken = createJwtToken(
    payload,
    config.jwt.jwt_refresh_secret as string,
    config.jwt.jwt_refresh_expire_in,
  );

  return { accessToken, refreshToken };
};

const sendOtpEmail = async (email: string, name: string, otp: string, type: "verify" | "reset") => {
  const template =
    type === "verify"
      ? emailTemplate.createAccount({ name, email, otp })
      : emailTemplate.resetPassword({ name, email, otp, expiresIn: 15 });

  await emailHelper.sendEmail(template);
};

const storeOtp = async (email: string, type: string, otp: string) => {
  const key = `${OTP_KEY_PREFIX}:${email}:${type}`;
  await redisClient.set(key, otp, OTP_EXPIRY_SECONDS);
};

const verifyStoredOtp = async (email: string, type: string, otp: string): Promise<boolean> => {
  const key = `${OTP_KEY_PREFIX}:${email}:${type}`;
  const stored = await redisClient.get(key);
  if (!stored || stored !== otp) return false;
  await redisClient.delete(key);
  return true;
};

// ─── Register ───────────────────────────────────────────
const register = async (payload: TRegisterPayload) => {
  const { email, password, name, role } = payload;

  // Check if verified account exists
  const existingVerified = await AuthRepository.findOne({
    email,
    isEmailVerified: true,
    isDeleted: false,
  });
  if (existingVerified) {
    throw new AppError(StatusCodes.CONFLICT, "Email already registered");
  }

  // Delete any unverified account with same email
  const existingUnverified = await AuthRepository.findOne({
    email,
    isEmailVerified: false,
    isDeleted: false,
  });
  if (existingUnverified) {
    await UserRepository.deleteMany({ auth: existingUnverified._id });
    await AuthRepository.deleteById(String(existingUnverified._id));
  }

  // Create auth (password hashed by pre-save hook)
  const auth = await AuthRepository.create({
    email,
    password, // will be hashed by pre-save hook
    role: (role === "helper" ? AuthRole.HELPER : AuthRole.USER) as any,
    isEmailVerified: false,
    status: AuthStatus.PENDING,
  });

  // Create user
  await UserRepository.create({
    auth: new Types.ObjectId(auth._id),
    name,
    email,
  });

  // Generate and send OTP
  const otp = generateOTP();
  console.log(`[DEV] OTP for ${email}: ${otp}`);
  await storeOtp(email, "verify", otp);
  await sendOtpEmail(email, name, otp, "verify");

  return {
    status: "unverified",
    email,
    message: "OTP sent to your email",
  };
};

// ─── Verify OTP ─────────────────────────────────────────
const verifyOtp = async (email: string, otp: string) => {
  const valid = await verifyStoredOtp(email, "verify", otp);
  if (!valid) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired OTP");
  }

  const auth = await AuthRepository.findOne({ email, isDeleted: false });
  if (!auth) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  if (auth.isEmailVerified) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Email already verified");
  }

  // Mark as verified and active
  await AuthRepository.updateById(String(auth._id), {
    isEmailVerified: true,
    status: AuthStatus.ACTIVE,
  });

  const user = await UserRepository.findOne({ auth: auth._id });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  const tokens = generateTokens(auth, String(user._id));

  return {
    ...tokens,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: auth.role,
      status: AuthStatus.ACTIVE,
    },
  };
};

// ─── Resend OTP ─────────────────────────────────────────
const resendOtp = async (email: string) => {
  const auth = await AuthRepository.findOne({ email, isDeleted: false });
  if (!auth) {
    throw new AppError(StatusCodes.NOT_FOUND, "No account found");
  }

  if (auth.isEmailVerified) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Email already verified");
  }

  const user = await UserRepository.findOne({ auth: auth._id });
  const name = user?.name || "User";

  const otp = generateOTP();
  await storeOtp(email, "verify", otp);
  await sendOtpEmail(email, name, otp, "verify");

  return { message: "OTP resent to your email" };
};

// ─── Login ──────────────────────────────────────────────
const login = async (payload: { email: string; password: string }) => {
  const { email, password } = payload;

  // Find auth with password field
  const auth = await AuthRepository.findOne(
    { email, isDeleted: false },
    { select: "+password" },
  );

  // Hide account existence for unverified accounts
  if (!auth || !auth.isEmailVerified) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "No account found");
  }

  // Compare password
  const isPasswordValid = await bcrypt.compare(password, auth.password || "");
  if (!isPasswordValid) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid credentials");
  }

  const user = await UserRepository.findOne({ auth: auth._id });
  if (!user || user.isBlocked) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Account has been blocked");
  }

  // Update last login
  await AuthRepository.updateById(String(auth._id), { lastLogin: new Date() });

  const tokens = generateTokens(auth, String(user._id));

  return {
    ...tokens,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: resolveUrl(user.avatar),
      role: auth.role,
      isSuperAdmin: auth.isSuperAdmin,
      permissions: (auth as any).permissions || ["*"],
      status: auth.status,
    },
  };
};

// ─── Google Login ───────────────────────────────────────
const googleLogin = async (payload: TGoogleLoginPayload) => {
  const { email, name, googleId, avatar, role } = payload;

  let auth = await AuthRepository.findOne({ email, isDeleted: false });

  if (auth) {
    // Existing account - update googleId if needed
    if (!auth.googleId) {
      await AuthRepository.updateById(String(auth._id), { googleId });
    }

    // Auto-verify if not already
    if (!auth.isEmailVerified) {
      await AuthRepository.updateById(String(auth._id), {
        isEmailVerified: true,
        status: AuthStatus.ACTIVE,
      });
    }

    // Update last login
    await AuthRepository.updateById(String(auth._id), { lastLogin: new Date() });

    const user = await UserRepository.findOne({ auth: auth._id });
    if (!user) {
      throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
    }

    const tokens = generateTokens(auth, String(user._id));

    return {
      ...tokens,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: resolveUrl(user.avatar),
        role: auth.role,
        status: auth.status,
      },
    };
  }

  // New account - create auth + user
  auth = await AuthRepository.create({
    email,
    password: "", // No password for Google users
    loginProvider: AuthProvider.GOOGLE,
    googleId,
    role: (role === "helper" ? AuthRole.HELPER : AuthRole.USER) as any,
    isEmailVerified: true,
    status: AuthStatus.ACTIVE,
  });

  const user = await UserRepository.create({
    auth: new Types.ObjectId(auth._id),
    name,
    email,
    avatar,
  });

  const tokens = generateTokens(auth, String(user._id));

  return {
    ...tokens,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: resolveUrl(user.avatar),
      role: auth.role,
      status: AuthStatus.ACTIVE,
    },
  };
};

// ─── Refresh Token ──────────────────────────────────────
const getAccessToken = async (refreshToken: string) => {
  const decoded = verifyJwtToken(refreshToken, config.jwt.jwt_refresh_secret as Secret);

  const auth = await AuthRepository.findById(decoded.authId);
  if (!auth || auth.isDeleted) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token");
  }

  const user = await UserRepository.findOne({ auth: auth._id });
  if (!user || user.isBlocked) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid refresh token");
  }

  const tokens = generateTokens(auth, String(user._id));

  return { accessToken: tokens.accessToken };
};

// ─── Forgot Password ────────────────────────────────────
const forgotPassword = async (email: string) => {
  const auth = await AuthRepository.findOne({ email, isDeleted: false, isEmailVerified: true });
  if (!auth) {
    // Don't reveal account existence
    return { message: "If an account exists, an OTP has been sent" };
  }

  const user = await UserRepository.findOne({ auth: auth._id });
  const name = user?.name || "User";

  const otp = generateOTP();
  await storeOtp(email, "reset", otp);
  await sendOtpEmail(email, name, otp, "reset");

  return { message: "If an account exists, an OTP has been sent" };
};

// ─── Verify Reset OTP ───────────────────────────────────
const verifyResetOtp = async (email: string, otp: string) => {
  const valid = await verifyStoredOtp(email, "reset", otp);
  if (!valid) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired OTP");
  }

  const auth = await AuthRepository.findOne({ email, isDeleted: false });
  if (!auth) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  // Generate a short-lived reset token
  const resetToken = createJwtToken(
    { authId: String(auth._id), type: "password_reset" },
    config.jwt.jwt_secret as string,
    "10m",
  );

  return { resetToken };
};

// ─── Reset Password ─────────────────────────────────────
const resetPassword = async (resetToken: string, newPassword: string) => {
  const decoded = verifyJwtToken(resetToken, config.jwt.jwt_secret as Secret);

  if (decoded.type !== "password_reset") {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid reset token");
  }

  const auth = await AuthRepository.findById(decoded.authId);
  if (!auth || auth.isDeleted) {
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  // Update password (will be hashed by pre-save hook)
  auth.password = newPassword;
  await auth.save();

  return { message: "Password reset successful" };
};

// ─── Phone OTP Helpers ─────────────────────────────────
const storePhoneOtp = async (phone: string, type: string, otp: string) => {
  const key = `${PHONE_OTP_KEY_PREFIX}:${phone}:${type}`;
  await redisClient.set(key, otp, OTP_EXPIRY_SECONDS);
  logger.info(`🔑 [PHONE OTP STORED] key: ${key}, code: ${otp}`);
};

const verifyStoredPhoneOtp = async (phone: string, type: string, otp: string): Promise<boolean> => {
  const key = `${PHONE_OTP_KEY_PREFIX}:${phone}:${type}`;
  const stored = await redisClient.get(key);
  logger.info(`🔍 [PHONE OTP VERIFY CHECK] key: ${key}, received: ${otp}, stored: ${stored || 'none'}`);
  // For simulation / development, accept FIXED_TEST_OTP or stored OTP
  if (!stored && otp !== FIXED_TEST_OTP) {
    logger.warn(`❌ [PHONE OTP FAILED] No stored OTP and received does not match test OTP: ${phone}`);
    return false;
  }
  if (stored && stored !== otp && otp !== FIXED_TEST_OTP) {
    logger.warn(`❌ [PHONE OTP MISMATCH] Received: ${otp}, Stored: ${stored} for ${phone}`);
    return false;
  }
  await redisClient.delete(key);
  logger.info(`✅ [PHONE OTP MATCHED] Successfully verified OTP for ${phone}`);
  return true;
};

// ─── Phone Register ─────────────────────────────────────
const registerWithPhone = async (payload: TPhoneRegisterPayload) => {
  const normalizedPhone = normalizeMoroccoPhone(payload.phone);
  const { password, name, role } = payload;
  logger.info(`📱 [PHONE REGISTER ATTEMPT] raw: ${payload.phone}, normalized: ${normalizedPhone}, role: ${role || 'user'}`);

  // 1. Blacklist check
  const blacklisted = await AuthRepository.findOne({
    phone: normalizedPhone,
    isBlacklisted: true,
  });
  if (blacklisted) {
    logger.warn(`🚫 [PHONE REGISTER BLOCKED] Phone is blacklisted: ${normalizedPhone}`);
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
    logger.warn(`⚠️ [PHONE REGISTER CONFLICT] Phone already registered and verified: ${normalizedPhone}`);
    throw new AppError(StatusCodes.CONFLICT, "Phone number is already registered. Please log in.");
  }

  // 3. Delete unverified account with same phone
  const existingUnverified = await AuthRepository.findOne({
    phone: normalizedPhone,
    isPhoneVerified: false,
    isDeleted: false,
  });
  if (existingUnverified) {
    logger.info(`🧹 [PHONE REGISTER CLEANUP] Removing previous unverified account for: ${normalizedPhone}`);
    await UserRepository.deleteMany({ auth: existingUnverified._id });
    await AuthRepository.deleteById(String(existingUnverified._id));
  }

  // 4. Rate limit check
  await checkAndIncrementOtpRateLimit(normalizedPhone);

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

  // 7. Store WhatsApp OTP
  await storePhoneOtp(normalizedPhone, "verify", FIXED_TEST_OTP);
  logger.info(`✅ [PHONE REGISTER SUCCESS] Created pending account authId: ${auth._id}, WhatsApp OTP: ${FIXED_TEST_OTP} for ${normalizedPhone}`);

  return {
    status: "unverified",
    phone: normalizedPhone,
    message: "WhatsApp verification code sent successfully",
  };
};

// ─── Verify Phone OTP ───────────────────────────────────
const verifyPhoneOtp = async (phone: string, otp: string) => {
  const normalizedPhone = normalizeMoroccoPhone(phone);
  logger.info(`📱 [VERIFY PHONE OTP ATTEMPT] raw: ${phone}, normalized: ${normalizedPhone}, otp: ${otp}`);
  
  const valid = await verifyStoredPhoneOtp(normalizedPhone, "verify", otp);
  if (!valid) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired WhatsApp OTP code");
  }

  const auth = await AuthRepository.findOne({ phone: normalizedPhone, isDeleted: false });
  if (!auth) {
    logger.error(`❌ [VERIFY PHONE OTP] Account not found in DB for: ${normalizedPhone}`);
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  if (auth.isBlacklisted) {
    logger.warn(`🚫 [VERIFY PHONE OTP] Account blacklisted: ${normalizedPhone}`);
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been permanently blacklisted.");
  }

  // Mark as verified and active
  await AuthRepository.updateById(String(auth._id), {
    isPhoneVerified: true,
    status: AuthStatus.ACTIVE,
  });

  const user = await UserRepository.findOne({ auth: auth._id });
  if (!user) {
    logger.error(`❌ [VERIFY PHONE OTP] User profile not found for authId: ${auth._id}`);
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  if (user.isBlocked) {
    throw new AppError(StatusCodes.FORBIDDEN, "Account has been suspended");
  }

  const tokens = generateTokens(auth, String(user._id));
  logger.info(`✅ [VERIFY PHONE OTP SUCCESS] User ${user._id} verified and active with role ${auth.role}`);

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
  logger.info(`📱 [RESEND PHONE OTP ATTEMPT] phone: ${normalizedPhone}`);
  const auth = await AuthRepository.findOne({ phone: normalizedPhone, isDeleted: false });
  if (!auth) {
    logger.warn(`❌ [RESEND PHONE OTP] Account not found: ${normalizedPhone}`);
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
  logger.info(`✅ [RESEND PHONE OTP SUCCESS] Sent OTP ${FIXED_TEST_OTP} to ${normalizedPhone}`);

  return { message: "WhatsApp verification code resent" };
};

// ─── Phone Login ────────────────────────────────────────
const loginWithPhone = async (payload: { phone: string; password: string; loginAs?: string }) => {
  const normalizedPhone = normalizeMoroccoPhone(payload.phone);
  const { password } = payload;
  logger.info(`🔐 [PHONE LOGIN ATTEMPT] raw: ${payload.phone}, normalized: ${normalizedPhone}`);

  const auth = await AuthRepository.findOne(
    { phone: normalizedPhone, isDeleted: false },
    { select: "+password" },
  );

  if (!auth) {
    logger.warn(`❌ [PHONE LOGIN FAILED] No active Auth record found in DB for phone: ${normalizedPhone}`);
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid phone number or password");
  }

  if (auth.isBlacklisted) {
    logger.warn(`🚫 [PHONE LOGIN BLOCKED] Account is blacklisted: ${normalizedPhone}`);
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been permanently suspended.");
  }

  const isPasswordValid = await bcrypt.compare(password, auth.password || "");
  if (!isPasswordValid) {
    logger.warn(`❌ [PHONE LOGIN FAILED] Password mismatch for phone: ${normalizedPhone}`);
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid phone number or password");
  }

  const user = await UserRepository.findOne({ auth: auth._id });
  if (!user || user.isBlocked) {
    logger.warn(`🚫 [PHONE LOGIN BLOCKED] User profile suspended or missing for authId: ${auth._id}`);
    throw new AppError(StatusCodes.FORBIDDEN, "This account has been suspended.");
  }

  if (!auth.isPhoneVerified) {
    logger.info(`⚠️ [PHONE LOGIN UNVERIFIED] Account ${auth._id} is unverified. Dispatching OTP.`);
    await storePhoneOtp(normalizedPhone, "verify", FIXED_TEST_OTP);
    return {
      status: "unverified",
      phone: normalizedPhone,
      isPhoneVerified: false,
      message: "Please verify your phone number. A WhatsApp OTP has been sent.",
    };
  }

  await AuthRepository.updateById(String(auth._id), { lastLogin: new Date() });

  const tokens = generateTokens(auth, String(user._id));
  logger.info(`✅ [PHONE LOGIN SUCCESS] Logged in authId: ${auth._id}, userId: ${user._id}, role: ${auth.role}`);

  return {
    ...tokens,
    user: {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatar: resolveUrl(user.avatar),
      role: auth.role,
      status: auth.status,
      isPhoneVerified: true,
      helperApplicationStatus: user.helperApplicationStatus,
    },
  };
};

// ─── Forgot Password (Phone) ────────────────────────────
const forgotPasswordPhone = async (phone: string) => {
  const normalizedPhone = normalizeMoroccoPhone(phone);
  logger.info(`🔑 [FORGOT PASSWORD PHONE ATTEMPT] raw: ${phone}, normalized: ${normalizedPhone}`);
  const auth = await AuthRepository.findOne({
    phone: normalizedPhone,
    isDeleted: false,
    isPhoneVerified: true,
  });

  if (!auth) {
    logger.warn(`⚠️ [FORGOT PASSWORD PHONE] No verified account found with phone: ${normalizedPhone}. Returning generic security response.`);
    return { message: "If an account exists, a WhatsApp reset code has been sent." };
  }

  await checkAndIncrementOtpRateLimit(normalizedPhone);
  await storePhoneOtp(normalizedPhone, "reset", FIXED_TEST_OTP);
  logger.info(`✅ [FORGOT PASSWORD PHONE SUCCESS] Stored reset OTP ${FIXED_TEST_OTP} for ${normalizedPhone}`);

  return { message: "If an account exists, a WhatsApp reset code has been sent." };
};

// ─── Verify Reset OTP (Phone) ───────────────────────────
const verifyResetOtpPhone = async (phone: string, otp: string) => {
  const normalizedPhone = normalizeMoroccoPhone(phone);
  logger.info(`🔑 [VERIFY RESET OTP PHONE ATTEMPT] phone: ${normalizedPhone}, otp: ${otp}`);
  const valid = await verifyStoredPhoneOtp(normalizedPhone, "reset", otp);
  if (!valid) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid or expired reset OTP code");
  }

  const auth = await AuthRepository.findOne({ phone: normalizedPhone, isDeleted: false });
  if (!auth) {
    logger.error(`❌ [VERIFY RESET OTP PHONE] Account not found in DB for: ${normalizedPhone}`);
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  const resetToken = createJwtToken(
    { authId: String(auth._id), phone: auth.phone, type: "password_reset" },
    config.jwt.jwt_secret as string,
    "10m",
  );
  logger.info(`✅ [VERIFY RESET OTP PHONE SUCCESS] Generated reset token for authId: ${auth._id}`);

  return { resetToken };
};

// ─── Reset Password (Phone) ─────────────────────────────
const resetPasswordPhone = async (resetToken: string, newPassword: string) => {
  const decoded = verifyJwtToken(resetToken, config.jwt.jwt_secret as Secret);

  if (decoded.type !== "password_reset") {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid reset token");
  }

  const auth = await AuthRepository.findById(decoded.authId);
  if (!auth || auth.isDeleted) {
    logger.error(`❌ [RESET PASSWORD PHONE] Account not found for authId: ${decoded.authId}`);
    throw new AppError(StatusCodes.NOT_FOUND, "Account not found");
  }

  auth.password = newPassword;
  await auth.save();
  logger.info(`✅ [RESET PASSWORD PHONE SUCCESS] Password updated for authId: ${auth._id}`);

  return { message: "Password reset successful" };
};

export const AuthService = {
  register,
  verifyOtp,
  resendOtp,
  login,
  googleLogin,
  getAccessToken,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  // Phone auth
  registerWithPhone,
  verifyPhoneOtp,
  resendPhoneOtp,
  loginWithPhone,
  forgotPasswordPhone,
  verifyResetOtpPhone,
  resetPasswordPhone,
};
