import { Router } from "express";
import auth from "@middlewares/auth";
import { SettingsController } from "./settings.controller";

const router = Router();

// GET /api/v1/admin/settings
router.get(
  "/",
  auth("superAdmin", "admin", "staff"),
  SettingsController.getSettings
);

// PATCH /api/v1/admin/settings
// Staff has full access — allow staff to save platform settings.
router.patch(
  "/",
  auth("superAdmin", "admin", "staff"),
  SettingsController.updateSettings
);

export const SettingsRoutes = router;

/** Public legal pages for the mobile app (no auth). */
export const LegalPublicRoutes = Router();
LegalPublicRoutes.get("/", SettingsController.getPublicLegal);
