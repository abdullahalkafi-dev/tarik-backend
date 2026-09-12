import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { DiditService } from "./didit.service";
import { UserRepository } from "../user/user.repository";

const createSession = catchAsync(async (req: Request, res: Response) => {
  const result = await DiditService.createSession(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Didit KYC session created successfully",
    data: result,
  });
});

const syncSession = catchAsync(async (req: Request, res: Response) => {
  const result = await DiditService.syncSession(
    req.user?._id as string,
    req.body.sessionId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Didit KYC status synced successfully",
    data: result,
  });
});

const handleWebhook = catchAsync(async (req: Request, res: Response) => {
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  const result = await DiditService.handleWebhook(req.headers, rawBody, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Webhook processed",
    data: result,
  });
});

const handleCallback = catchAsync(async (req: Request, res: Response) => {
  const sessionId = (req.query.verificationSessionId || req.query.session_id || req.query.sessionId) as string;
  const status = (req.query.status as string) || "Completed";

  if (sessionId) {
    try {
      const user = await UserRepository.findOne({ diditSessionId: sessionId });
      if (user) {
        await DiditService.syncSession(String(user._id), sessionId);
      }
    } catch (_) {}
  }

  const isApproved = status.toLowerCase() === "approved";

  res.setHeader("Content-Type", "text/html");
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Complete - Tarik</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background-color: #0F172A; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; text-align: center; }
        .card { background: #1E293B; border-radius: 24px; padding: 36px 24px; max-width: 400px; width: 100%; border: 1px solid #334155; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
        .icon-box { width: 80px; height: 80px; border-radius: 50%; background: ${isApproved ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)'}; color: ${isApproved ? '#10B981' : '#3B82F6'}; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 40px; }
        h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; color: #FFFFFF; }
        p { font-size: 15px; color: #94A3B8; line-height: 1.5; margin-bottom: 28px; }
        .btn { display: block; width: 100%; padding: 14px; background: #00D09E; color: #0F172A; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; border: none; cursor: pointer; transition: 0.2s; }
        .btn:hover { opacity: 0.9; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon-box">${isApproved ? '✓' : 'ℹ'}</div>
        <h1>${isApproved ? 'Verification Approved!' : 'Verification Complete'}</h1>
        <p>${isApproved ? 'Your identity has been successfully verified. You can now return to the Tarik app.' : 'Your identity documents have been submitted. Please return to the Tarik app to continue.'}</p>
        <a href="tarik://didit/callback?sessionId=${encodeURIComponent(sessionId || "")}&status=${encodeURIComponent(status)}" class="btn">Return to Tarik App</a>
        <p style="font-size: 12px; color: #64748B; margin-top: 16px;">Returning to app automatically...</p>
      </div>
      <script>
        setTimeout(() => {
          try {
            window.location.href = "tarik://didit/callback?sessionId=${encodeURIComponent(sessionId || "")}&status=${encodeURIComponent(status)}";
          } catch(e) {}
        }, 300);
      </script>
    </body>
    </html>
  `);
});

export const DiditController = {
  createSession,
  syncSession,
  handleWebhook,
  handleCallback,
};
