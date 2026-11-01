import { StatusCodes } from "http-status-codes";
import { Request } from "express";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { AuthService } from "./auth.service";

const clientMeta = (req: Request) => ({ userAgent: req.get("user-agent") || undefined });

const authIdOf = (req: Request): string => {
  const user = req.user as any;
  return String(user?.auth?._id || user?.auth);
};

const login = catchAsync(async (req, res) => {
  const result = await AuthService.login(req.body, clientMeta(req));

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Login successful",
    data: result,
  });
});

const getAccessToken = catchAsync(async (req, res) => {
  const result = await AuthService.getAccessToken(req.body.refreshToken, clientMeta(req));

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Token refreshed",
    data: result,
  });
});

const logout = catchAsync(async (req, res) => {
  const result = await AuthService.logout((req.user as any)?.sessionId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const socketToken = catchAsync(async (req, res) => {
  const user = req.user as any;
  const token = AuthService.createSocketToken({
    userId: String(user._id),
    tokenVersion: user.auth?.tokenVersion ?? 0,
    sessionId: user.sessionId,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Socket token",
    data: { token },
  });
});

const logoutAll = catchAsync(async (req, res) => {
  const result = await AuthService.logoutAll(authIdOf(req));

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const changePassword = catchAsync(async (req, res) => {
  const result = await AuthService.changePassword(
    authIdOf(req),
    String((req.user as any)._id),
    req.body.currentPassword,
    req.body.newPassword,
    clientMeta(req),
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: { accessToken: result.accessToken, refreshToken: result.refreshToken },
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
  const result = await AuthService.verifyPhoneOtp(req.body.phone, req.body.otp, clientMeta(req));

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
  const result = await AuthService.loginWithPhone(req.body, clientMeta(req));

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: (result as { message?: string }).message || "Login successful",
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
  login,
  getAccessToken,
  logout,
  logoutAll,
  socketToken,
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
