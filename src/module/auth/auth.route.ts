import { Router } from "express";
import validateRequest from "@middlewares/validateRequest";
import auth from "@middlewares/auth";
import { AuthController } from "./auth.controller";
import { AuthDto } from "./auth.dto";
import { authLimiter, createLimiter } from "@middlewares/security";

const router = Router();

const refreshLimiter = createLimiter({
  name: "refresh-token",
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: "Too many token refreshes, please try again later.",
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    E-mail + password login (admin / staff accounts only)
 * @access  Public
 */
router.post("/login", authLimiter, validateRequest(AuthDto.login), AuthController.login);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Get a new access token (and a renewed refresh token) using a refresh token
 * @access  Public
 */
router.post(
  "/refresh-token",
  refreshLimiter,
  validateRequest(AuthDto.refreshToken),
  AuthController.getAccessToken,
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    End the current device session
 * @access  Private
 */
router.post("/logout", auth(), validateRequest(AuthDto.logout), AuthController.logout);

/**
 * @route   POST /api/v1/auth/logout-all
 * @desc    End every session of the account on all devices
 * @access  Private
 */
router.post("/logout-all", auth(), AuthController.logoutAll);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password (logs out all other devices, returns fresh tokens)
 * @access  Private
 */
router.post(
  "/change-password",
  authLimiter,
  auth(),
  validateRequest(AuthDto.changePassword),
  AuthController.changePassword,
);

/**
 * @route   POST /api/v1/auth/phone-register
 * @desc    Register with Moroccan mobile phone and password (sends WhatsApp OTP)
 * @access  Public
 */
router.post(
  "/phone-register",
  authLimiter,
  validateRequest(AuthDto.phoneRegister),
  AuthController.registerWithPhone,
);

/**
 * @route   POST /api/v1/auth/verify-phone-otp
 * @desc    Verify Moroccan phone with 6-digit WhatsApp OTP
 * @access  Public
 */
router.post(
  "/verify-phone-otp",
  authLimiter,
  validateRequest(AuthDto.verifyPhoneOtp),
  AuthController.verifyPhoneOtp,
);

/**
 * @route   POST /api/v1/auth/resend-whatsapp-otp
 * @desc    Resend WhatsApp OTP for phone registration
 * @access  Public
 */
router.post(
  "/resend-whatsapp-otp",
  authLimiter,
  validateRequest(AuthDto.resendPhoneOtp),
  AuthController.resendPhoneOtp,
);

/**
 * @route   POST /api/v1/auth/phone-login
 * @desc    Login with Moroccan phone and password (daily login, no OTP required)
 * @access  Public
 */
router.post(
  "/phone-login",
  authLimiter,
  validateRequest(AuthDto.phoneLogin),
  AuthController.loginWithPhone,
);

/**
 * @route   POST /api/v1/auth/forgot-password-phone
 * @desc    Send password reset WhatsApp OTP to Moroccan phone
 * @access  Public
 */
router.post(
  "/forgot-password-phone",
  authLimiter,
  validateRequest(AuthDto.forgotPasswordPhone),
  AuthController.forgotPasswordPhone,
);

/**
 * @route   POST /api/v1/auth/verify-reset-otp-phone
 * @desc    Verify password reset OTP for phone and receive resetToken
 * @access  Public
 */
router.post(
  "/verify-reset-otp-phone",
  authLimiter,
  validateRequest(AuthDto.verifyResetOtpPhone),
  AuthController.verifyResetOtpPhone,
);

/**
 * @route   POST /api/v1/auth/reset-password-phone
 * @desc    Reset password using phone reset token
 * @access  Public
 */
router.post(
  "/reset-password-phone",
  authLimiter,
  validateRequest(AuthDto.resetPasswordPhone),
  AuthController.resetPasswordPhone,
);

export const AuthRoutes = router;
