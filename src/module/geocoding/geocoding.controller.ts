import { Request, Response } from "express";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { StatusCodes } from "http-status-codes";
import { GeocodingService } from "./geocoding.service";

const reverseGeocode = catchAsync(async (req: Request, res: Response) => {
  const { lat, lon } = req.query as { lat: string; lon: string };
  const result = await GeocodingService.reverseGeocode(Number(lat), Number(lon));

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Success",
    data: result,
  });
});

const forwardGeocode = catchAsync(async (req: Request, res: Response) => {
  const { q, limit } = req.query as { q: string; limit?: string };
  const result = await GeocodingService.forwardGeocode(q, Number(limit) || 5);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Success",
    data: result,
  });
});

export const GeocodingController = {
  reverseGeocode,
  forwardGeocode,
};
