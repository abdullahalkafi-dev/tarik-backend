import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { AdminService } from "./admin.service";

const listHelperApplications = catchAsync(async (req, res) => {
  const result = await AdminService.listHelperApplications(
    req.query.status as string | undefined,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helper applications fetched successfully",
    data: result,
  });
});

const getHelperById = catchAsync(async (req, res) => {
  const result = await AdminService.getHelperById(req.params.userId as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helper details fetched successfully",
    data: result,
  });
});

const listUsers = catchAsync(async (req, res) => {
  const result = await AdminService.listUsers(
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20,
    req.query.search as string | undefined,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Users fetched successfully",
    data: result,
  });
});

const getUserById = catchAsync(async (req, res) => {
  const result = await AdminService.getUserById(req.params.userId as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User details fetched successfully",
    data: result,
  });
});

const approveHelper = catchAsync(async (req, res) => {
  const result = await AdminService.approveHelper(
    req.params.userId as string,
    req.user?._id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helper approved successfully",
    data: result,
  });
});

const rejectHelper = catchAsync(async (req, res) => {
  const reason = req.body.reason || req.body.rejectionReason || "Application rejected by admin";
  const result = await AdminService.rejectHelper(
    req.params.userId as string,
    reason,
    req.user?._id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helper rejected successfully",
    data: result,
  });
});

const permanentBanHelper = catchAsync(async (req, res) => {
  const reason = req.body.reason || "Fraudulent activity or severe security policy violation";
  const result = await AdminService.permanentBanHelper(
    req.params.userId as string,
    req.user?._id as string,
    reason,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const unbanHelper = catchAsync(async (req, res) => {
  const result = await AdminService.unbanHelper(
    req.params.userId as string,
    req.user?._id as string,
    req.body.reason,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const blockUser = catchAsync(async (req, res) => {
  const result = await AdminService.blockUser(req.params.userId as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User block status toggled",
    data: result,
  });
});

const getStats = catchAsync(async (_req, res) => {
  const result = await AdminService.getStats();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Stats fetched successfully",
    data: result,
  });
});

// ─── Admin Profile ────────────────────────────────────────
const getAdminProfile = catchAsync(async (req, res) => {
  const result = await AdminService.getAdminProfile(String((req.user as any)?._id));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Admin profile fetched successfully",
    data: result,
  });
});

const updateAdminProfile = catchAsync(async (req, res) => {
  const result = await AdminService.updateAdminProfile(
    String((req.user as any)?._id),
    req.body || {},
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Admin profile updated successfully",
    data: result,
  });
});

// ─── Staff Management ─────────────────────────────────────
const getStaffList = catchAsync(async (req, res) => {
  const result = await AdminService.getStaffList(
    Number(req.query.page as string) || 1,
    Number(req.query.limit as string) || 20,
    req.query.search as string | undefined,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Staff list fetched successfully",
    data: result,
  });
});

const createStaff = catchAsync(async (req, res) => {
  const result = await AdminService.createStaff(req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Staff member created successfully",
    data: result,
  });
});

const updateStaff = catchAsync(async (req, res) => {
  const result = await AdminService.updateStaff(String(req.params.staffId), req.body);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Staff member updated successfully",
    data: result,
  });
});

const deleteStaff = catchAsync(async (req, res) => {
  const result = await AdminService.deleteStaff(String(req.params.staffId));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

// ─── Job/Booking History ─────────────────────────────────────
const getHelperJobs = catchAsync(async (req, res) => {
  const result = await AdminService.getHelperJobs(
    req.params.userId as string,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 10,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helper job history fetched successfully",
    data: result,
  });
});

const getUserBookings = catchAsync(async (req, res) => {
  const result = await AdminService.getUserBookings(
    req.params.userId as string,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 10,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User booking history fetched successfully",
    data: result,
  });
});

const getJobPipelineSummary = catchAsync(async (_req, res) => {
  const { JobRepository } = await import("../job/job.repository");
  const counts = await JobRepository.countByStatus();
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job pipeline summary fetched successfully",
    data: counts,
  });
});

const getJobCancellations = catchAsync(async (req, res) => {
  const { JobRepository } = await import("../job/job.repository");
  const result = await JobRepository.findCancellations(
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20,
    req.query.search as string | undefined,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Cancellations fetched successfully",
    data: result,
  });
});

export const AdminController = {
  listHelperApplications,
  getHelperById,
  listUsers,
  getUserById,
  approveHelper,
  rejectHelper,
  permanentBanHelper,
  unbanHelper,
  blockUser,
  getStats,
  // Staff Management
  getAdminProfile,
  updateAdminProfile,
  getStaffList,
  createStaff,
  updateStaff,
  deleteStaff,
  // Job/Booking History
  getHelperJobs,
  getUserBookings,
  getJobPipelineSummary,
  getJobCancellations,
};
