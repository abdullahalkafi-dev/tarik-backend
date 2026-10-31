import { Router } from "express";
import auth, { requirePermission } from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { SettingsController } from "./settings.controller";
import { SettingsDto } from "./settings.dto";

const router = Router();

// GET /api/v1/admin/settings — every staff member may read
router.get("/", auth("superAdmin", "admin", "staff"), SettingsController.getSettings);

// GET /api/v1/admin/settings/history — who changed what
router.get(
  "/history",
  auth("superAdmin", "admin", "staff"),
  requirePermission("settings.manage"),
  SettingsController.getHistory,
);

// PATCH /api/v1/admin/settings — validated, audited, finance/admin only
router.patch(
  "/",
  auth("superAdmin", "admin", "staff"),
  requirePermission("settings.manage"),
  validateRequest(SettingsDto.update),
  SettingsController.updateSettings,
);

export const SettingsRoutes = router;

/** Public legal pages for the mobile app (no auth). */
export const LegalPublicRoutes = Router();
LegalPublicRoutes.get("/", SettingsController.getPublicLegal);

/** Public app configuration (brand, support contact, min app version, fee). */
export const ConfigPublicRoutes = Router();
ConfigPublicRoutes.get("/", SettingsController.getPublicConfig);
