import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
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
  validateRequest(JobDto.createJob),
  JobController.createJob,
);

/**
 * @route   GET /api/v1/jobs
 * @desc    List jobs (paginated, optional category filter)
 * @access  Private
 */
router.get(
  "/",
  auth(),
  validateRequest(JobDto.jobQuery),
  JobController.getJobs,
);

/**
 * @route   GET /api/v1/jobs/nearby
 * @desc    Get nearby jobs based on user's stored location
 * @access  Private
 */
router.get("/nearby", auth(), JobController.getNearbyJobs);

/**
 * @route   GET /api/v1/jobs/my-bookings
 * @desc    Get current user's posted bookings (active, completed, cancelled)
 * @access  Private
 */
router.get("/my-bookings", auth(), JobController.getMyBookings);

/**
 * @route   GET /api/v1/jobs/my-assigned-jobs
 * @desc    Get helper's assigned jobs (active, completed, cancelled)
 * @access  Private (helper)
 */
router.get("/my-assigned-jobs", auth("helper"), JobController.getMyAssignedJobs);

/**
 * @route   GET /api/v1/jobs/:id
 * @desc    Get job details
 * @access  Private
 */
router.get("/:id", auth(), JobController.getJobById);

/**
 * @route   POST /api/v1/jobs/:id/accept
 * @desc    Accept job (helper only, deducts 20% commission if cash job)
 * @access  Private (helper)
 */
router.post("/:id/accept", auth("helper"), JobController.acceptJob);

/**
 * @route   POST /api/v1/jobs/:id/complete
 * @desc    Complete job (releases escrow to helper if online job)
 * @access  Private
 */
router.post(
  "/:id/complete",
  auth(),
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
 * @desc    Cancel job (refunds 20% commission to helper if cash in_progress)
 * @access  Private
 */
router.post(
  "/:id/cancel",
  auth(),
  validateRequest(JobDto.cancelJob),
  JobController.cancelJob,
);

/**
 * @route   POST /api/v1/jobs/:id/checkout
 * @desc    Re-open payment session for unpaid (pending_payment) job
 * @access  Private (owner)
 */
router.post("/:id/checkout", auth(), JobController.retryJobCheckout);

/**
 * @route   PATCH /api/v1/jobs/:id
 * @desc    Update job (owner only)
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
 * @desc    Delete job (owner only, open status only)
 * @access  Private
 */
router.delete("/:id", auth(), JobController.deleteJob);

export const JobRoutes = router;
