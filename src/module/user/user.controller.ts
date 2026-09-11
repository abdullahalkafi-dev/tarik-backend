import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { UserService } from "./user.service";

const getMe = catchAsync(async (req, res) => {
  const result = await UserService.getMe(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User fetched successfully",
    data: result,
  });
});

const updateProfile = catchAsync(async (req, res) => {
  const result = await UserService.updateProfile(req.user?._id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Profile updated successfully",
    data: result,
  });
});

const updateLocation = catchAsync(async (req, res) => {
  const result = await UserService.updateLocation(req.user?._id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Location updated successfully",
    data: result,
  });
});

const helperApply = catchAsync(async (req, res) => {
  const result = await UserService.helperApply(req.user?._id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Application submitted successfully",
    data: result,
  });
});

const getApplicationStatus = catchAsync(async (req, res) => {
  const result = await UserService.getApplicationStatus(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Application status fetched",
    data: result,
  });
});

const searchHelpers = catchAsync(async (req, res) => {
  const result = await UserService.searchHelpers({
    category: req.query.category as string | undefined,
    maxDistance: Number(req.query.maxDistance) || undefined,
    latitude: Number(req.query.lat) || undefined,
    longitude: Number(req.query.lon) || undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helpers fetched successfully",
    data: result,
  });
});

const getHelperProfile = catchAsync(async (req, res) => {
  const result = await UserService.getHelperProfile(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helper profile fetched",
    data: result,
  });
});

const submitAppeal = catchAsync(async (req, res) => {
  const result = await UserService.submitAppeal(
    req.user?._id as string,
    req.body.message,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Appeal submitted successfully and is pending admin review",
    data: result,
  });
});

const registerDeviceToken = catchAsync(async (req, res) => {
  const result = await UserService.registerDeviceToken(req.user?._id as string, {
    token: req.body.token,
    platform: req.body.platform,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Device token registered successfully",
    data: result,
  });
});

const clearDeviceToken = catchAsync(async (req, res) => {
  const result = await UserService.clearDeviceToken(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Device token cleared successfully",
    data: result,
  });
});

export const UserController = {
  getMe,
  updateProfile,
  updateLocation,
  helperApply,
  getApplicationStatus,
  searchHelpers,
  getHelperProfile,
  submitAppeal,
  registerDeviceToken,
  clearDeviceToken,
};
