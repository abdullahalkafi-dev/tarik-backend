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

const numOrUndef = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const searchHelpers = catchAsync(async (req, res) => {
  const result = await UserService.searchHelpers({
    category: req.query.category as string | undefined,
    maxDistance: numOrUndef(req.query.maxDistance),
    minRating: numOrUndef(req.query.minRating),
    maxPrice: numOrUndef(req.query.maxPrice),
    sort: req.query.sort as any,
    search: req.query.search as string | undefined,
    latitude: numOrUndef(req.query.lat),
    longitude: numOrUndef(req.query.lon),
    page: numOrUndef(req.query.page) || 1,
    limit: numOrUndef(req.query.limit) || 20,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helpers fetched successfully",
    data: result,
  });
});

const getHelperProfile = catchAsync(async (req, res) => {
  const result = await UserService.getHelperProfile(req.params.id as string, {
    latitude: numOrUndef(req.query.lat),
    longitude: numOrUndef(req.query.lon),
  });

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
    locale: req.body.locale,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Device token registered successfully",
    data: result,
  });
});

const clearDeviceToken = catchAsync(async (req, res) => {
  const result = await UserService.clearDeviceToken(req.user?._id as string, req.body?.token);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Device token cleared successfully",
    data: result,
  });
});

const setAvailability = catchAsync(async (req, res) => {
  const result = await UserService.setAvailability(req.user?._id as string, req.body.isAvailable);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Availability updated",
    data: result,
  });
});

const acceptLegal = catchAsync(async (req, res) => {
  const result = await UserService.acceptLegal(req.user?._id as string, req.body.version);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Terms accepted",
    data: result,
  });
});

const deleteAccount = catchAsync(async (req, res) => {
  const result = await UserService.deleteAccount(req.user?._id as string, req.body.password);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

export const UserController = {
  setAvailability,
  acceptLegal,
  deleteAccount,
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
