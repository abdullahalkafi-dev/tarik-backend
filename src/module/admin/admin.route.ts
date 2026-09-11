import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { AdminController } from "./admin.controller";
import { AdminDto } from "./admin.dto";
import { CreateStaffDto, UpdateStaffDto, StaffIdDto } from "./staff.dto";
import { SettingsRoutes } from "../settings/settings.route";

const router = Router();

// ─── Admin Self-Profile ──────────────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/me
 * @desc    Get authenticated admin/staff profile, role, and permissions
 * @access  Private (superAdmin, admin, staff)
 */
router.get("/me", auth("superAdmin", "admin", "staff"), AdminController.getAdminProfile);

/**
 * @route   PATCH /api/v1/admin/me
 * @desc    Update own admin/staff profile (name, phone, avatar)
 * @access  Private (superAdmin, admin, staff)
 */
router.patch("/me", auth("superAdmin", "admin", "staff"), AdminController.updateAdminProfile);

// ─── Platform Stats ──────────────────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/stats
 * @desc    Get platform stats (users, helpers, applications, appeals)
 * @access  Private (superAdmin, admin, staff)
 */
router.get("/stats", auth("superAdmin", "admin", "staff"), AdminController.getStats);

// ─── Job Pipeline / Cancellations ────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/jobs/pipeline-summary
 * @desc    Counts per job status for Bookings panel
 * @access  Private (superAdmin, admin, staff)
 */
router.get(
  "/jobs/pipeline-summary",
  auth("superAdmin", "admin", "staff"),
  AdminController.getJobPipelineSummary,
);

/**
 * @route   GET /api/v1/admin/jobs/cancellations
 * @desc    Paginated cancelled jobs with client/helper names + lifetime cancel counts
 * @access  Private (superAdmin, admin, staff)
 */
router.get(
  "/jobs/cancellations",
  auth("superAdmin", "admin", "staff"),
  AdminController.getJobCancellations,
);

// ─── Helper Applications ─────────────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/helpers
 * @desc    List helper applications (filterable by status)
 * @access  Private (superAdmin, admin, staff)
 */
router.get(
  "/helpers",
  auth("superAdmin", "admin", "staff"),
  validateRequest(AdminDto.listHelpers),
  AdminController.listHelperApplications,
);

/**
 * @route   GET /api/v1/admin/helpers/:userId
 * @desc    Get full helper verification profile and audit logs
 * @access  Private (superAdmin, admin, staff)
 */
router.get(
  "/helpers/:userId",
  auth("superAdmin", "admin", "staff"),
  validateRequest(AdminDto.getHelperById),
  AdminController.getHelperById,
);

/**
 * @route   POST /api/v1/admin/helpers/:userId/approve
 * @desc    Approve a helper application
 * @access  Private (superAdmin, admin, staff)
 */
router.post(
  "/helpers/:userId/approve",
  auth("superAdmin", "admin", "staff"),
  validateRequest(AdminDto.approveHelper),
  AdminController.approveHelper,
);

/**
 * @route   POST /api/v1/admin/helpers/:userId/reject
 * @desc    Reject a helper application with feedback
 * @access  Private (superAdmin, admin, staff)
 */
router.post(
  "/helpers/:userId/reject",
  auth("superAdmin", "admin", "staff"),
  validateRequest(AdminDto.rejectHelper),
  AdminController.rejectHelper,
);

/**
 * @route   POST /api/v1/admin/helpers/:userId/ban
 * @desc    Permanently ban helper + blacklist phone & Moroccan ID
 * @access  Private (superAdmin, admin, staff)
 */
router.post(
  "/helpers/:userId/ban",
  auth("superAdmin", "admin", "staff"),
  validateRequest(AdminDto.permanentBanHelper),
  AdminController.permanentBanHelper,
);

/**
 * @route   POST /api/v1/admin/helpers/:userId/unban
 * @desc    Unban helper, restore account, remove document from blacklist
 * @access  Private (superAdmin, admin, staff)
 */
router.post(
  "/helpers/:userId/unban",
  auth("superAdmin", "admin", "staff"),
  validateRequest(AdminDto.unbanHelper),
  AdminController.unbanHelper,
);

// ─── Users / Customers ───────────────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/users
 * @desc    List registered users / customers
 * @access  Private (superAdmin, admin, staff)
 */
router.get(
  "/users",
  auth("superAdmin", "admin", "staff"),
  validateRequest(AdminDto.listUsers),
  AdminController.listUsers,
);

/**
 * @route   GET /api/v1/admin/users/:userId
 * @desc    Get user details
 * @access  Private (superAdmin, admin, staff)
 */
router.get(
  "/users/:userId",
  auth("superAdmin", "admin", "staff"),
  AdminController.getUserById,
);

/**
 * @route   POST /api/v1/admin/users/:userId/block
 * @desc    Toggle block status for a user
 * @access  Private (superAdmin, admin, staff)
 */
router.post(
  "/users/:userId/block",
  auth("superAdmin", "admin", "staff"),
  validateRequest(AdminDto.blockUser),
  AdminController.blockUser,
);

// ─── Staff Management (Super Admin Only) ─────────────────────────────────────
/**
 * @route   GET /api/v1/admin/staff
 * @desc    List all staff members
 * @access  Private (superAdmin only)
 */
router.get("/staff", auth("superAdmin"), AdminController.getStaffList);

/**
 * @route   POST /api/v1/admin/staff
 * @desc    Create a new staff member with email/password (auto-verified)
 * @access  Private (superAdmin only)
 */
router.post(
  "/staff",
  auth("superAdmin"),
  validateRequest(CreateStaffDto),
  AdminController.createStaff,
);

/**
 * @route   PATCH /api/v1/admin/staff/:staffId
 * @desc    Update staff permissions, status, or profile
 * @access  Private (superAdmin only)
 */
router.patch(
  "/staff/:staffId",
  auth("superAdmin"),
  validateRequest(UpdateStaffDto),
  AdminController.updateStaff,
);

/**
 * @route   DELETE /api/v1/admin/staff/:staffId
 * @desc    Remove a staff member (guarded against deleting Super Admin)
 * @access  Private (superAdmin only)
 */
router.delete(
  "/staff/:staffId",
  auth("superAdmin"),
  validateRequest(StaffIdDto),
  AdminController.deleteStaff,
);

// ─── Helper Work History ────────────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/helpers/:userId/jobs
 * @desc    Get job history for a specific helper
 * @access  Private (superAdmin, admin, staff)
 */
router.get(
  "/helpers/:userId/jobs",
  auth("superAdmin", "admin", "staff"),
  AdminController.getHelperJobs,
);

// ─── User Booking History ──────────────────────────────────────────────────
/**
 * @route   GET /api/v1/admin/users/:userId/bookings
 * @desc    Get booking history for a specific user
 * @access  Private (superAdmin, admin, staff)
 */
router.get(
  "/users/:userId/bookings",
  auth("superAdmin", "admin", "staff"),
  AdminController.getUserBookings,
);

// ─── Platform Settings ───────────────────────────────────────────────────────
router.use("/settings", SettingsRoutes);

export const AdminRoutes = router;


