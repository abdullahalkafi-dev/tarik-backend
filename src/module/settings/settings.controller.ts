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

// The seeded defaults ("… update from Admin → Settings → Legal.") are hints
// for admins; never show them to app users — the app has its own fallback.
const publicLegalText = (value?: string) =>
  !value || /update from Admin/i.test(value) ? "" : value;

const getPublicLegal = catchAsync(async (_req, res) => {
  const settings = await SettingsService.getSettings();
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Legal pages fetched",
    data: {
      termsOfService: publicLegalText(settings.legal?.termsOfService),
      privacyPolicy: publicLegalText(settings.legal?.privacyPolicy),
    },
  });
});

export const SettingsController = {
  getSettings,
  updateSettings,
  getPublicLegal,
};
