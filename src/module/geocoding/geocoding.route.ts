import { Router } from "express";
import validateRequest from "@middlewares/validateRequest";
import { GeocodingController } from "./geocoding.controller";
import { GeocodingDto } from "./geocoding.dto";
import { geocodingLimiter } from "@middlewares/security";

const router = Router();

/**
 * @route   GET /api/v1/geocoding/reverse
 * @desc    Reverse geocode: coordinates → address
 * @access  Public (rate limited)
 */
router.get(
  "/reverse",
  geocodingLimiter,
  validateRequest(GeocodingDto.reverse),
  GeocodingController.reverseGeocode,
);

/**
 * @route   GET /api/v1/geocoding/forward
 * @desc    Forward geocode: address query → coordinates
 * @access  Public (rate limited)
 */
router.get(
  "/forward",
  geocodingLimiter,
  validateRequest(GeocodingDto.forward),
  GeocodingController.forwardGeocode,
);

export const GeocodingRoutes = router;
