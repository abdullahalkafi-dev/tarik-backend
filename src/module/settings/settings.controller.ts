import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { SettingsService } from "./settings.service";

const getSettings = catchAsync(async (_req, res) => {
  const result = await SettingsService.getSettings();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Platform settings fetched successfully",
    data: result,
  });
});

const updateSettings = catchAsync(async (req, res) => {
  const user = req.user as any;
  const result = await SettingsService.updateSettings(req.body, {
    userId: user?._id ? String(user._id) : undefined,
    name: user?.name,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Platform settings updated successfully",
    data: result,
  });
});

const getHistory = catchAsync(async (req, res) => {
  const result = await SettingsService.getHistory(Number(req.query.limit) || 50);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Settings history fetched",
    data: result,
  });
});

const langOf = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 2).toLowerCase() : "en";

const getPublicLegal = catchAsync(async (req, res) => {
  const cfg = await SettingsService.getPublicConfig(langOf(req.query.lang));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Legal pages fetched",
    data: {
      termsOfService: cfg.termsOfService,
      privacyPolicy: cfg.privacyPolicy,
      version: cfg.legalVersion,
    },
  });
});

const getPublicConfig = catchAsync(async (req, res) => {
  const result = await SettingsService.getPublicConfig(langOf(req.query.lang));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Config fetched",
    data: result,
  });
});

export const SettingsController = {
  getSettings,
  updateSettings,
  getHistory,
  getPublicLegal,
  getPublicConfig,
};
