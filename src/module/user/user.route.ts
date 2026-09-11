import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { UserController } from "./user.controller";
import { UserDto } from "./user.dto";

const router = Router();

/**
 * @route   GET /api/v1/user/me
 * @desc    Get current user profile (dynamic based on role)
 * @access  Private
 */
router.get("/me", auth(), UserController.getMe);

/**
 * @route   PATCH /api/v1/user/me
 * @desc    Update current user profile
 * @access  Private
 */
router.patch(
  "/me",
  auth(),
  validateRequest(UserDto.updateProfile),
  UserController.updateProfile,
);

/**
 * @route   PATCH /api/v1/user/location
 * @desc    Set/update user location
 * @access  Private
 */
router.patch(
  "/location",
  auth(),
  validateRequest(UserDto.updateLocation),
  UserController.updateLocation,
);

/**
 * @route   POST /api/v1/user/helper/apply
 * @desc    Submit helper application form
 * @access  Private
 */
router.post(
  "/helper/apply",
  auth(),
  validateRequest(UserDto.helperApply),
  UserController.helperApply,
);

/**
 * @route   GET /api/v1/user/helper/application-status
 * @desc    Get helper application status
 * @access  Private
 */
router.get(
  "/helper/application-status",
  auth(),
  UserController.getApplicationStatus,
);

/**
 * @route   POST /api/v1/user/helper/appeal
 * @desc    Submit an appeal against helper application rejection
 * @access  Private (authenticated user)
 */
router.post(
  "/helper/appeal",
  auth(),
  validateRequest(UserDto.submitAppeal),
  UserController.submitAppeal,
);

/**
 * @route   GET /api/v1/user/helpers/search
 * @desc    Search approved helpers (nearby, by category)
 * @access  Private
 */
router.get("/helpers/search", auth(), UserController.searchHelpers);

/**
 * @route   GET /api/v1/user/helpers/:id
 * @desc    Get a single helper's public profile
 * @access  Private
 */
router.get("/helpers/:id", auth(), UserController.getHelperProfile);

/**
 * @route   POST /api/v1/user/device-token
 * @desc    Register FCM device token for push notifications
 * @access  Private
 */
router.post(
  "/device-token",
  auth(),
  validateRequest(UserDto.registerDeviceToken),
  UserController.registerDeviceToken,
);

/**
 * @route   DELETE /api/v1/user/device-token
 * @desc    Clear FCM device token (logout)
 * @access  Private
 */
router.delete(
  "/device-token",
  auth(),
  UserController.clearDeviceToken,
);

export const UserRoutes = router;
