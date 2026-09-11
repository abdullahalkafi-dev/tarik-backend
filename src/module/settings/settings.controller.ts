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
  const result = await SettingsService.updateSettings(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Platform settings updated successfully",
    data: result,
  });
});

const getPublicLegal = catchAsync(async (_req, res) => {
  const settings = await SettingsService.getSettings();
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Legal pages fetched",
    data: {
      termsOfService: settings.legal?.termsOfService || "",
      privacyPolicy: settings.legal?.privacyPolicy || "",
    },
  });
});

export const SettingsController = {
  getSettings,
  updateSettings,
  getPublicLegal,
};
