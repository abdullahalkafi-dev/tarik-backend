import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { JobService } from "./job.service";

const STAFF_ROLES = ["admin", "superAdmin", "staff"];
const isStaff = (req: any) => STAFF_ROLES.includes(String(req.user?.role));
const uid = (req: any) => String(req.user?._id);

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const createJob = catchAsync(async (req, res) => {
  const result = await JobService.createJob(uid(req), req.body);

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
  const result = await JobService.getNearbyJobs(uid(req), {
    lat: num(req.query.lat),
    lon: num(req.query.lon),
    maxDistance: num(req.query.maxDistance),
    category: req.query.category as string | undefined,
    page: num(req.query.page),
    limit: num(req.query.limit),
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Nearby jobs fetched successfully",
    data: result,
  });
});

const getJobById = catchAsync(async (req, res) => {
  const result = await JobService.getJobById(req.params.id as string, {
    userId: uid(req),
    role: req.user?.role,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job fetched successfully",
    data: result,
  });
});

const acceptJob = catchAsync(async (req, res) => {
  const result = await JobService.acceptJob(uid(req), req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job accepted successfully",
    data: result,
  });
});

const updateJob = catchAsync(async (req, res) => {
  const result = await JobService.updateJob(uid(req), req.params.id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job updated successfully",
    data: result,
  });
});

const deleteJob = catchAsync(async (req, res) => {
  const result = await JobService.deleteJob(uid(req), req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: null,
  });
});

const getMyBookings = catchAsync(async (req, res) => {
  const result = await JobService.getMyBookings(uid(req), {
    tab: req.query.tab as any,
    page: num(req.query.page),
    limit: num(req.query.limit),
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Client bookings fetched successfully",
    data: result,
  });
});

const getMyAssignedJobs = catchAsync(async (req, res) => {
  const result = await JobService.getMyAssignedJobs(uid(req), {
    tab: req.query.tab as any,
    page: num(req.query.page),
    limit: num(req.query.limit),
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Helper assigned jobs fetched successfully",
    data: result,
  });
});

const completeJob = catchAsync(async (req, res) => {
  const result = await JobService.completeJob(uid(req), req.params.id as string, req.body?.note, {
    isAdmin: isStaff(req),
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job completed successfully",
    data: result,
  });
});

const confirmCashReceived = catchAsync(async (req, res) => {
  const result = await JobService.confirmCashReceived(uid(req), req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Cash payment confirmed",
    data: result,
  });
});

const cancelJob = catchAsync(async (req, res) => {
  const result = await JobService.cancelJob(uid(req), req.params.id as string, req.body.reason, {
    isAdmin: isStaff(req),
    code: req.body.code,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Job cancelled successfully",
    data: result,
  });
});

const retryJobCheckout = catchAsync(async (req, res) => {
  const result = await JobService.retryJobCheckout(uid(req), req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Checkout session created",
    data: result,
  });
});

const markOnTheWay = catchAsync(async (req, res) => {
  const result = await JobService.markOnTheWay(uid(req), req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Marked as on the way",
    data: result,
  });
});

const markArrived = catchAsync(async (req, res) => {
  const result = await JobService.markArrived(uid(req), req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Marked as arrived",
    data: result,
  });
});

const markFinished = catchAsync(async (req, res) => {
  const result = await JobService.markFinished(uid(req), req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Marked as finished — waiting for the client's confirmation",
    data: result,
  });
});

const reportProblem = catchAsync(async (req, res) => {
  const result = await JobService.reportProblem(uid(req), req.params.id as string, req.body.message);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Problem reported. Support will contact you.",
    data: result,
  });
});

const resolveDispute = catchAsync(async (req, res) => {
  const result = await JobService.resolveDispute(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Dispute closed",
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
  markOnTheWay,
  markArrived,
  markFinished,
  reportProblem,
  resolveDispute,
};
