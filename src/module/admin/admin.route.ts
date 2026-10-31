import { Router } from "express";
import auth, { requirePermission } from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { AdminController } from "./admin.controller";
import { AdminDto } from "./admin.dto";
import { CreateStaffDto, UpdateStaffDto, StaffIdDto } from "./staff.dto";
import { SettingsRoutes } from "../settings/settings.route";

const router = Router();

/** Any staff account (admin / staff / super admin). What each one may DO is the permission below. */
const staff = auth("superAdmin", "admin", "staff");

// ─── Admin Self-Profile ──────────────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/me
 * @desc    Get authenticated admin/staff profile, role, and permissions
 */
router.get("/me", staff, AdminController.getAdminProfile);

/**
 * @route   PATCH /api/v1/admin/me
 * @desc    Update own admin/staff profile (name, phone, avatar)
 */
router.patch("/me", staff, validateRequest(AdminDto.updateProfile), AdminController.updateAdminProfile);

// ─── Platform Stats ──────────────────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/stats
 * @desc    Platform stats (customers, helpers, bookings, real commission earnings)
 * @access  stats.view
 */
router.get("/stats", staff, requirePermission("stats.view"), AdminController.getStats);

// ─── Job Pipeline / Cancellations ────────────────────────────────────────────
router.get(
  "/jobs/pipeline-summary",
  staff,
  requirePermission("jobs.view"),
  AdminController.getJobPipelineSummary,
);

router.get(
  "/jobs/cancellations",
  staff,
  requirePermission("jobs.view"),
  AdminController.getJobCancellations,
);

// ─── Live Fleet Map ──────────────────────────────────────────────────────────
router.get(
  "/map/helpers",
  staff,
  requirePermission("map.view"),
  validateRequest(AdminDto.mapQuery),
  AdminController.getLiveHelperLocations,
);

// ─── Helper Applications ─────────────────────────────────────────────────────
router.get(
  "/helpers",
  staff,
  requirePermission("helpers.view"),
  validateRequest(AdminDto.listHelpers),
  AdminController.listHelperApplications,
);

router.get(
  "/helpers/:userId",
  staff,
  requirePermission("helpers.view"),
  validateRequest(AdminDto.getHelperById),
  AdminController.getHelperById,
);

/** Click-to-reveal phone / e-mail (the access is written to the audit trail). */
router.get(
  "/helpers/:userId/contact",
  staff,
  requirePermission("helpers.view"),
  validateRequest(AdminDto.getHelperById),
  AdminController.getHelperContact,
);

router.post(
  "/helpers/:userId/approve",
  staff,
  requirePermission("helpers.review"),
  validateRequest(AdminDto.approveHelper),
  AdminController.approveHelper,
);

router.post(
  "/helpers/:userId/reject",
  staff,
  requirePermission("helpers.review"),
  validateRequest(AdminDto.rejectHelper),
  AdminController.rejectHelper,
);

router.post(
  "/helpers/:userId/ban",
  staff,
  requirePermission("helpers.review"),
  validateRequest(AdminDto.permanentBanHelper),
  AdminController.permanentBanHelper,
);

router.post(
  "/helpers/:userId/unban",
  staff,
  requirePermission("helpers.review"),
  validateRequest(AdminDto.unbanHelper),
  AdminController.unbanHelper,
);

// ─── Users / Customers ───────────────────────────────────────────────────────
router.get(
  "/users",
  staff,
  requirePermission("users.view"),
  validateRequest(AdminDto.listUsers),
  AdminController.listUsers,
);

router.get("/users/:userId", staff, requirePermission("users.view"), AdminController.getUserById);

/** Block with a mandatory reason; running jobs are cancelled with refunds, sessions end. */
router.post(
  "/users/:userId/block",
  staff,
  requirePermission("users.manage"),
  validateRequest(AdminDto.blockUser),
  AdminController.blockUser,
);

router.post(
  "/users/:userId/unblock",
  staff,
  requirePermission("users.manage"),
  validateRequest(AdminDto.unblockUser),
  AdminController.unblockUser,
);

// ─── Staff Management (Super Admin Only) ─────────────────────────────────────
router.get("/staff", auth("superAdmin"), AdminController.getStaffList);

router.post(
  "/staff",
  auth("superAdmin"),
  validateRequest(CreateStaffDto),
  AdminController.createStaff,
);

router.patch(
  "/staff/:staffId",
  auth("superAdmin"),
  validateRequest(UpdateStaffDto),
  AdminController.updateStaff,
);

router.delete(
  "/staff/:staffId",
  auth("superAdmin"),
  validateRequest(StaffIdDto),
  AdminController.deleteStaff,
);

// ─── Helper Work History ────────────────────────────────────────────────────
router.get(
  "/helpers/:userId/jobs",
  staff,
  requirePermission("helpers.view"),
  AdminController.getHelperJobs,
);

// ─── User Booking History ──────────────────────────────────────────────────
router.get(
  "/users/:userId/bookings",
  staff,
  requirePermission("users.view"),
  AdminController.getUserBookings,
);

// ─── Platform Settings ───────────────────────────────────────────────────────
router.use("/settings", SettingsRoutes);

export const AdminRoutes = router;
