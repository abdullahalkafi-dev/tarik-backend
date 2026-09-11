import { Router } from "express";
import validateRequest from "@middlewares/validateRequest";
import { AuthController } from "./auth.controller";
import { AuthDto } from "./auth.dto";
import { authLimiter } from "@middlewares/security";

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register with email and password (sends OTP)
 * @access  Public
 */
router.post(
  "/register",
  authLimiter,
  validateRequest(AuthDto.register),
  AuthController.register,
);

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify email with OTP
 * @access  Public
 */
router.post(
  "/verify-otp",
  authLimiter,
  validateRequest(AuthDto.verifyOtp),
  AuthController.verifyOtp,
);

/**
 * @route   POST /api/v1/auth/resend-otp
 * @desc    Resend verification OTP
 * @access  Public
 */
router.post(
  "/resend-otp",
  authLimiter,
  validateRequest(AuthDto.resendOtp),
  AuthController.resendOtp,
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login with email and password
 * @access  Public
 */
router.post(
  "/login",
  authLimiter,
  validateRequest(AuthDto.login),
  AuthController.login,
);

/**
 * @route   POST /api/v1/auth/google-login
 * @desc    Login with Google (auto-verified)
 * @access  Public
 */
router.post(
  "/google-login",
  authLimiter,
  validateRequest(AuthDto.googleLogin),
  AuthController.googleLogin,
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Get new access token using refresh token
 * @access  Public
 */
router.post(
  "/refresh-token",
  validateRequest(AuthDto.refreshToken),
  AuthController.getAccessToken,
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Send password reset OTP
 * @access  Public
 */
router.post(
  "/forgot-password",
  authLimiter,
  validateRequest(AuthDto.forgotPassword),
  AuthController.forgotPassword,
);

/**
 * @route   POST /api/v1/auth/verify-reset-otp
 * @desc    Verify password reset OTP
 * @access  Public
 */
router.post(
  "/verify-reset-otp",
  authLimiter,
  validateRequest(AuthDto.verifyResetOtp),
  AuthController.verifyResetOtp,
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  "/reset-password",
  authLimiter,
  validateRequest(AuthDto.resetPassword),
  AuthController.resetPassword,
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
