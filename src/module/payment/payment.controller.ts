import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { PaymentService } from "./payment.service";

const initializePayment = catchAsync(async (req, res) => {
  const result = await PaymentService.initializePayment(req.user?._id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Payment checkout session initialized successfully",
    data: result,
  });
});

const handleWebhook = catchAsync(async (req, res) => {
  const signature = req.headers["x-simulator-signature"] as string | undefined;
  const result = await PaymentService.handleWebhook(req.body, signature);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const handleCallback = catchAsync(async (req, res) => {
  const result = await PaymentService.handleCallback(req.query as any);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: result.message,
    data: result,
  });
});

const getAllPayments = catchAsync(async (req, res) => {
  const result = await PaymentService.getAllPayments({
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    status: req.query.status as string,
    paymentMethod: req.query.paymentMethod as string,
    search: req.query.search as string,
    sort: req.query.sort === "oldest" ? "oldest" : "newest",
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Payments fetched successfully",
    data: result,
  });
});

const getPaymentById = catchAsync(async (req, res) => {
  const result = await PaymentService.getPaymentById(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Payment fetched successfully",
    data: result,
  });
});

const getStuckPayments = catchAsync(async (req, res) => {
  const result = await PaymentService.getStuckPayments(
    Number(req.query.olderThanHours) || 24,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Stuck payments fetched successfully",
    data: result,
  });
});

export const PaymentController = {
  initializePayment,
  handleWebhook,
  handleCallback,
  getAllPayments,
  getPaymentById,
  getStuckPayments,
};
