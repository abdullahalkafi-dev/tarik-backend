import { Router } from "express";
import auth, { requirePermission, requireStaffPermission } from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { createContentLimiter } from "@middlewares/security";
import { JobController } from "./job.controller";
import { JobDto } from "./job.dto";

const router = Router();

/**
 * @route   POST /api/v1/jobs
 * @desc    Create a new job post
 * @access  Private
 */
router.post(
  "/",
  auth(),
  createContentLimiter,
  validateRequest(JobDto.createJob),
  JobController.createJob,
);

/**
 * @route   GET /api/v1/jobs
 * @desc    List ALL jobs with customer details (admin console only)
 * @access  Private (staff, jobs.view)
 */
router.get(
  "/",
  auth("superAdmin", "admin", "staff"),
  requirePermission("jobs.view"),
  validateRequest(JobDto.jobQuery),
  JobController.getJobs,
);

/**
 * @route   GET /api/v1/jobs/nearby
 * @desc    Open jobs near the helper (current GPS or saved location), paginated
 * @access  Private
 */
router.get("/nearby", auth(), validateRequest(JobDto.nearbyQuery), JobController.getNearbyJobs);

/**
 * @route   GET /api/v1/jobs/my-bookings
 * @desc    Current user's posted bookings (active, completed, cancelled)
 * @access  Private
 */
router.get("/my-bookings", auth(), validateRequest(JobDto.myListQuery), JobController.getMyBookings);

/**
 * @route   GET /api/v1/jobs/my-assigned-jobs
 * @desc    Helper's assigned jobs (active, completed, cancelled)
 * @access  Private (helper)
 */
router.get(
  "/my-assigned-jobs",
  auth("helper"),
  validateRequest(JobDto.myListQuery),
  JobController.getMyAssignedJobs,
);

/**
 * @route   GET /api/v1/jobs/:id
 * @desc    Job details (public view for strangers, full view for the two parties)
 * @access  Private
 */
router.get("/:id", auth(), JobController.getJobById);

/**
 * @route   POST /api/v1/jobs/:id/accept
 * @desc    Accept job (helper only, deducts commission if cash job)
 * @access  Private (helper)
 */
router.post("/:id/accept", auth("helper"), JobController.acceptJob);

/**
 * @route   POST /api/v1/jobs/:id/on-the-way | /arrived | /finish
 * @desc    Helper progress steps
 * @access  Private (assigned helper)
 */
router.post("/:id/on-the-way", auth("helper"), JobController.markOnTheWay);
router.post("/:id/arrived", auth("helper"), JobController.markArrived);
router.post("/:id/finish", auth("helper"), JobController.markFinished);

/**
 * @route   POST /api/v1/jobs/:id/complete
 * @desc    Client confirms the work (releases escrow to the helper if online)
 * @access  Private
 */
router.post(
  "/:id/complete",
  auth(),
  requireStaffPermission("jobs.manage"),
  validateRequest(JobDto.completeJob),
  JobController.completeJob,
);

/**
 * @route   POST /api/v1/jobs/:id/cash-received
 * @desc    Helper confirms cash received after client completed the job
 * @access  Private (assigned helper)
 */
router.post("/:id/cash-received", auth("helper"), JobController.confirmCashReceived);

/**
 * @route   POST /api/v1/jobs/:id/cancel
 * @desc    Cancel job (policy rules apply; refunds are automatic)
 * @access  Private
 */
router.post(
  "/:id/cancel",
  auth(),
  requireStaffPermission("jobs.manage"),
  validateRequest(JobDto.cancelJob),
  JobController.cancelJob,
);

/**
 * @route   POST /api/v1/jobs/:id/report-problem
 * @desc    Open a dispute (pauses automatic completion, creates a support ticket)
 * @access  Private (client or assigned helper)
 */
router.post(
  "/:id/report-problem",
  auth(),
  createContentLimiter,
  validateRequest(JobDto.reportProblem),
  JobController.reportProblem,
);

/**
 * @route   POST /api/v1/jobs/:id/resolve-dispute
 * @desc    Close a dispute so the job can complete / pay out again
 * @access  Private (staff, jobs.manage)
 */
router.post(
  "/:id/resolve-dispute",
  auth("superAdmin", "admin", "staff"),
  requirePermission("jobs.manage"),
  JobController.resolveDispute,
);

/**
 * @route   POST /api/v1/jobs/:id/checkout
 * @desc    Re-open payment session for unpaid (pending_payment) job
 * @access  Private (owner)
 */
router.post("/:id/checkout", auth(), JobController.retryJobCheckout);

/**
 * @route   PATCH /api/v1/jobs/:id
 * @desc    Update an OPEN job (owner only)
 * @access  Private
 */
router.patch(
  "/:id",
  auth(),
  validateRequest(JobDto.updateJob),
  JobController.updateJob,
);

/**
 * @route   DELETE /api/v1/jobs/:id
 * @desc    Delete an unpaid job (owner only)
 * @access  Private
 */
router.delete("/:id", auth(), JobController.deleteJob);

export const JobRoutes = router;
