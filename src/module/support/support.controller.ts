import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { SupportService } from "./support.service";
import { getSocketServer } from "../../socket/socket.gateway";

const createTicket = catchAsync(async (req, res) => {
  const result = await SupportService.createTicket(
    req.user?._id as string,
    req.body.subject,
    req.body.message
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Support ticket created successfully",
    data: result,
  });
});

const getUserTickets = catchAsync(async (req, res) => {
  const result = await SupportService.getUserTickets(req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Support tickets fetched successfully",
    data: result,
  });
});

const getTicketDetails = catchAsync(async (req, res) => {
  const isAdmin = ["admin", "superAdmin", "staff"].includes(req.user?.role as string);
  const result = await SupportService.getTicketDetails(
    req.user?._id as string,
    req.params.id as string,
    isAdmin
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Support ticket details fetched successfully",
    data: result,
  });
});

const sendMessage = catchAsync(async (req, res) => {
  const role = ["admin", "superAdmin", "staff"].includes(req.user?.role as string)
    ? "admin"
    : (req.user?.role as any);

  const result = await SupportService.sendMessage(
    req.user?._id as string,
    req.params.id as string,
    req.body.content,
    req.body.attachments || [],
    role
  );

  // Emit socket event for real-time delivery
  const io = getSocketServer();
  if (io) {
    const payload = {
      ticketId: req.params.id,
      message: result,
    };
    // Ticket room (owner joined via support:join; admin can too)
    io.to(`support:${req.params.id}`).emit("support:message", payload);

    // Also notify ticket owner's user room so list updates off-screen.
    // Client dedupes by message _id when both rooms deliver.
    try {
      const ticket = await SupportService.getTicketOwnerForEmit(req.params.id as string);
      if (ticket && String(ticket) !== String(req.user?._id)) {
        io.to(`user:${ticket}`).emit("support:message", payload);
      }
    } catch (_) {}
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Support message sent successfully",
    data: result,
  });
});

const getAllTickets = catchAsync(async (req, res) => {
  const result = await SupportService.getAllTickets(
    req.query.status as string,
    req.query.userRole as "user" | "helper" | undefined,
    Number(req.query.page) || 1,
    Number(req.query.limit) || 20
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "All support tickets fetched successfully",
    data: result,
  });
});

const updateTicketStatus = catchAsync(async (req, res) => {
  const result = await SupportService.updateTicketStatus(
    req.params.id as string,
    req.body.status
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Support ticket status updated successfully",
    data: result,
  });
});

export const SupportController = {
  createTicket,
  getUserTickets,
  getTicketDetails,
  sendMessage,
  getAllTickets,
  updateTicketStatus,
};
