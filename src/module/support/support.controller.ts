import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { SupportService } from "./support.service";
import { getSocketServer } from "../../socket/socket.gateway";

const STAFF_ROLES = ["admin", "superAdmin", "staff"];
const isStaff = (req: any) => STAFF_ROLES.includes(req.user?.role as string);

const createTicket = catchAsync(async (req, res) => {
  const result = await SupportService.createTicket(req.user?._id as string, req.body);

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
  const result = await SupportService.getTicketDetails(
    req.user?._id as string,
    req.params.id as string,
    isStaff(req),
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Support ticket details fetched successfully",
    data: result,
  });
});

const sendMessage = catchAsync(async (req, res) => {
  const role = isStaff(req) ? "admin" : (req.user?.role as any);

  const result = await SupportService.sendMessage(
    req.user?._id as string,
    req.params.id as string,
    req.body.content,
    req.body.attachments || [],
    role,
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
    // Staff inbox (list + unread badges update live)
    io.to("support:admins").emit("support:message", payload);

    // Also notify ticket owner's user room so list updates off-screen.
    // Client dedupes by message _id when both rooms deliver.
    try {
      const ticket = await SupportService.getTicketOwnerForEmit(req.params.id as string);
      if (ticket && String(ticket) !== String(req.user?._id)) {
        io.to(`user:${ticket}`).emit("support:message", payload);
      }
    } catch (_) {
      // best effort
    }
  }

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Support message sent successfully",
    data: result,
  });
});

const getAllTickets = catchAsync(async (req, res) => {
  const result = await SupportService.getAllTickets(String(req.user?._id), {
    status: req.query.status as string | undefined,
    userRole: req.query.userRole as "user" | "helper" | undefined,
    category: req.query.category as string | undefined,
    priority: req.query.priority as string | undefined,
    assignee: req.query.assignee as string | undefined,
    search: req.query.search as string | undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "All support tickets fetched successfully",
    data: result,
  });
});

const updateTicketStatus = catchAsync(async (req, res) => {
  const result = await SupportService.updateTicketStatus(req.params.id as string, req.body.status);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Support ticket status updated successfully",
    data: result,
  });
});

const updateTicketMeta = catchAsync(async (req, res) => {
  const result = await SupportService.updateTicketMeta(req.params.id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Support ticket updated",
    data: result,
  });
});

const addNote = catchAsync(async (req, res) => {
  const result = await SupportService.addInternalNote(
    req.params.id as string,
    String(req.user?._id),
    req.body.text,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Note added",
    data: result,
  });
});

const reopenTicket = catchAsync(async (req, res) => {
  const result = await SupportService.reopenTicket(String(req.user?._id), req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Ticket reopened",
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
  updateTicketMeta,
  addNote,
  reopenTicket,
};
