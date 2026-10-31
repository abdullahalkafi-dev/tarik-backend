import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { ReviewService } from "./review.service";

const createReview = catchAsync(async (req, res) => {
  const result = await ReviewService.createReview(req.user?._id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Review submitted successfully",
    data: result,
  });
});

const getUserReviews = catchAsync(async (req, res) => {
  const result = await ReviewService.getUserReviews(
    req.params.userId as string,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "User reviews fetched successfully",
    data: result,
  });
});

const getAllReviews = catchAsync(async (req, res) => {
  const result = await ReviewService.getAllReviews({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    rating: req.query.rating ? Number(req.query.rating) : undefined,
    jobId: req.query.jobId as string,
    revieweeId: req.query.revieweeId as string,
    reviewerId: req.query.reviewerId as string,
    search: req.query.search as string,
    reported: req.query.reported === "true",
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Reviews fetched successfully",
    data: result,
  });
});

const dismissReport = catchAsync(async (req, res) => {
  const result = await ReviewService.dismissReport(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const deleteReview = catchAsync(async (req, res) => {
  const result = await ReviewService.deleteReview(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const editReview = catchAsync(async (req, res) => {
  const result = await ReviewService.editReview(String(req.user?._id), req.params.id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Review updated",
    data: result,
  });
});

const replyToReview = catchAsync(async (req, res) => {
  const result = await ReviewService.replyToReview(String(req.user?._id), req.params.id as string, req.body.text);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Reply published",
    data: result,
  });
});

const reportReview = catchAsync(async (req, res) => {
  const result = await ReviewService.reportReview(String(req.user?._id), req.params.id as string, req.body.reason);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Review reported",
    data: result,
  });
});

export const ReviewController = {
  editReview,
  replyToReview,
  reportReview,
  createReview,
  getUserReviews,
  getAllReviews,
  deleteReview,
  dismissReport,
};
