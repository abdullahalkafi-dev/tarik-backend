import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { GeocodingController } from "./geocoding.controller";
import { GeocodingDto } from "./geocoding.dto";
import { geocodingLimiter } from "@middlewares/security";

const router = Router();

/**
 * @route   GET /api/v1/geocoding/reverse
 * @desc    Reverse geocode: coordinates → address (cached, localized)
 * @access  Private (90 requests / minute / user)
 */
router.get(
  "/reverse",
  auth(),
  geocodingLimiter,
  validateRequest(GeocodingDto.reverse),
  GeocodingController.reverseGeocode,
);

/**
 * @route   GET /api/v1/geocoding/forward
 * @desc    Forward geocode: address query → coordinates (cached, localized)
 * @access  Private (90 requests / minute / user)
 */
router.get(
  "/forward",
  auth(),
  geocodingLimiter,
  validateRequest(GeocodingDto.forward),
  GeocodingController.forwardGeocode,
);

export const GeocodingRoutes = router;
