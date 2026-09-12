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
  const acceptsHtml = req.headers.accept?.includes("text/html") || !req.xhr;

  if (acceptsHtml) {
    const isSuccess = result.status === "success" || (req.query.status as string) === "success";
    const deepLinkUrl = `tarik://payment/callback?status=${encodeURIComponent(result.status)}&orderId=${encodeURIComponent(result.orderId)}&transactionId=${encodeURIComponent(result.transactionId)}&orderType=${encodeURIComponent((result as any).orderType || "")}`;

    res.setHeader("Content-Type", "text/html");
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment ${isSuccess ? "Successful" : "Status"} - Tarik</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          body { background-color: #0F172A; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; text-align: center; }
          .card { background: #1E293B; border-radius: 24px; padding: 36px 24px; max-width: 400px; width: 100%; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
          .icon-box { width: 80px; height: 80px; border-radius: 50%; background: ${isSuccess ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${isSuccess ? '#10B981' : '#EF4444'}; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 40px; }
          h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #FFFFFF; }
          p { font-size: 15px; color: #94A3B8; line-height: 1.5; margin-bottom: 28px; }
          .btn { display: block; width: 100%; padding: 14px; background: #00D09E; color: #0F172A; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; border: none; cursor: pointer; transition: 0.2s; }
          .btn:hover { opacity: 0.9; }
          .hint { font-size: 12px; color: #64748B; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon-box">${isSuccess ? '✓' : '✕'}</div>
          <h1>${isSuccess ? 'Payment Successful!' : 'Payment Incomplete'}</h1>
          <p>${isSuccess ? 'Your payment was processed successfully. Tap below to return to the Tarik app.' : 'Your payment could not be completed. Tap below to return to the app.'}</p>
          <a href="${deepLinkUrl}" class="btn">Return to Tarik App</a>
          <p class="hint">Opening the app automatically...</p>
        </div>
        <script>
          // Attempt instant deep link redirect
          setTimeout(function() {
            window.location.href = "${deepLinkUrl}";
          }, 300);
        </script>
      </body>
      </html>
    `);
  }

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
