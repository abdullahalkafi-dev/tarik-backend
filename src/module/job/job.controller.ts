import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { JobService } from "./job.service";

const createJob = catchAsync(async (req, res) => {
  const result = await JobService.createJob(
    req.user?._id as string,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Job created successfully",
    data: result,
  });
});

const getJobs = catchAsync(async (req, res) => {
  const result = await JobService.getJobs({
    category: req.query.category as string,
    status: req.query.status as string,
    paymentMethod: req.query.paymentMethod as string,
    search: req.query.search as string,
    assignedTo: req.query.assignedTo as string,
    postedBy: req.query.postedBy as string,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Jobs fetched successfully",
    data: result,
  });
});

const getNearbyJobs = catchAsync(async (req, res) => {
  const result = await JobService.getNearbyJobs(
    req.user?._id as string,
    Number(req.query.maxDistance) || undefined,
    req.query.category as string | undefined,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Nearby jobs fetched successfully",
    data: result,
  });
});

const getJobById = catchAsync(async (req, res) => {
  const result = await JobService.getJobById(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job fetched successfully",
    data: result,
  });
});

const acceptJob = catchAsync(async (req, res) => {
  const result = await JobService.acceptJob(
    req.user?._id as string,
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job accepted successfully",
    data: result,
  });
});

const updateJob = catchAsync(async (req, res) => {
  const result = await JobService.updateJob(
    req.user?._id as string,
    req.params.id as string,
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job updated successfully",
    data: result,
  });
});

const deleteJob = catchAsync(async (req, res) => {
  const result = await JobService.deleteJob(
    req.user?._id as string,
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const getMyBookings = catchAsync(async (req, res) => {
  const result = await JobService.getMyBookings(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Client bookings fetched successfully",
    data: result,
  });
});

const getMyAssignedJobs = catchAsync(async (req, res) => {
  const result = await JobService.getMyAssignedJobs(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helper assigned jobs fetched successfully",
    data: result,
  });
});

const completeJob = catchAsync(async (req, res) => {
  const result = await JobService.completeJob(
    req.user?._id as string,
    req.params.id as string,
    req.body?.note,
    req.user?.role === "admin" || req.user?.role === "superAdmin" || req.user?.role === "staff",
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job completed successfully",
    data: result,
  });
});

const confirmCashReceived = catchAsync(async (req, res) => {
  const result = await JobService.confirmCashReceived(
    req.user?._id as string,
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Cash payment confirmed",
    data: result,
  });
});

const cancelJob = catchAsync(async (req, res) => {
  const result = await JobService.cancelJob(
    req.user?._id as string,
    req.params.id as string,
    req.body.reason,
    req.user?.role === "admin" || req.user?.role === "superAdmin" || req.user?.role === "staff",
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job cancelled successfully",
    data: result,
  });
});

const retryJobCheckout = catchAsync(async (req, res) => {
  const result = await JobService.retryJobCheckout(
    req.user?._id as string,
    req.params.id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Checkout session created",
    data: result,
  });
});

export const JobController = {
  createJob,
  getJobs,
  getNearbyJobs,
  getJobById,
  acceptJob,
  updateJob,
  deleteJob,
  getMyBookings,
  getMyAssignedJobs,
  completeJob,
  confirmCashReceived,
  cancelJob,
  retryJobCheckout,
};
