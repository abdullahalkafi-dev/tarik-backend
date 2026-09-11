import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { AuthService } from "./auth.service";

const register = catchAsync(async (req, res) => {
  const result = await AuthService.register(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: result.message,
    data: { status: result.status, email: result.email },
  });
});

const verifyOtp = catchAsync(async (req, res) => {
  const result = await AuthService.verifyOtp(req.body.email, req.body.otp);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Email verified successfully",
    data: result,
  });
});

const resendOtp = catchAsync(async (req, res) => {
  const result = await AuthService.resendOtp(req.body.email);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const login = catchAsync(async (req, res) => {
  const result = await AuthService.login(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Login successful",
    data: result,
  });
});

const googleLogin = catchAsync(async (req, res) => {
  const result = await AuthService.googleLogin(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Login successful",
    data: result,
  });
});

const getAccessToken = catchAsync(async (req, res) => {
  const result = await AuthService.getAccessToken(req.body.refreshToken);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Token refreshed",
    data: result,
  });
});

const forgotPassword = catchAsync(async (req, res) => {
  const result = await AuthService.forgotPassword(req.body.email);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const verifyResetOtp = catchAsync(async (req, res) => {
  const result = await AuthService.verifyResetOtp(req.body.email, req.body.otp);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "OTP verified",
    data: result,
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const result = await AuthService.resetPassword(req.body.resetToken, req.body.newPassword);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const registerWithPhone = catchAsync(async (req, res) => {
  const result = await AuthService.registerWithPhone(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: result.message,
    data: { status: result.status, phone: result.phone },
  });
});

const verifyPhoneOtp = catchAsync(async (req, res) => {
  const result = await AuthService.verifyPhoneOtp(req.body.phone, req.body.otp);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Phone number verified successfully",
    data: result,
  });
});

const resendPhoneOtp = catchAsync(async (req, res) => {
  const result = await AuthService.resendPhoneOtp(req.body.phone);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const loginWithPhone = catchAsync(async (req, res) => {
  const result = await AuthService.loginWithPhone(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message || "Login successful",
    data: result,
  });
});

const forgotPasswordPhone = catchAsync(async (req, res) => {
  const result = await AuthService.forgotPasswordPhone(req.body.phone);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const verifyResetOtpPhone = catchAsync(async (req, res) => {
  const result = await AuthService.verifyResetOtpPhone(req.body.phone, req.body.otp);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Reset OTP verified",
    data: result,
  });
});

const resetPasswordPhone = catchAsync(async (req, res) => {
  const result = await AuthService.resetPasswordPhone(req.body.resetToken, req.body.newPassword);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const AuthController = {
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
