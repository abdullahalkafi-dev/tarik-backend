import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { SupportRepository } from "./support.repository";
import { TicketStatus } from "./support.interface";
import { UserRepository } from "module/user/user.repository";
import { resolveUrl } from "util/minio";
import { notifyUser } from "util/notifyUser";
import { notifyAdmins } from "util/notifyAdmins";
import { logger } from "logger/logger";

/** Live role: Auth.role if populated, else helper application status. */
const resolveLiveUserRole = (user: any): "user" | "helper" => {
  if (!user) return "user";
  const authRole =
    typeof user.auth === "object" && user.auth ? (user.auth as any).role : undefined;
  if (authRole === "helper") return "helper";
  if (user.helperApplicationStatus === "approved") return "helper";
  if (user.isHelperFormSubmitted === true) return "helper";
  return "user";
};

// ─── Helper: Resolve avatar URLs in ticket/user objects ─────
const resolveTicketUrls = (ticket: any) => {
  if (!ticket) return ticket;
  if (ticket.user) {
    const liveRole = resolveLiveUserRole(ticket.user);
    ticket.userRole = liveRole;
    ticket.user = {
      ...ticket.user,
      role: liveRole,
      avatar: resolveUrl(ticket.user.avatar),
    };
  }
  return ticket;
};

const resolveMessageUrls = (messages: any[]) => {
  return messages.map((msg) => {
    if (msg.sender) {
      msg.sender = {
        ...msg.sender,
        avatar: resolveUrl(msg.sender.avatar),
      };
    }
    if (msg.attachments && Array.isArray(msg.attachments)) {
      msg.attachments = msg.attachments.map(resolveUrl).filter(Boolean);
    }
    return msg;
  });
};

// ─── Create Ticket ───────────────────────────────────────
const createTicket = async (userId: string, subject: string, initialMessage: string) => {
  const user = await UserRepository.findById(userId, { populate: "auth" });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const userRole = resolveLiveUserRole(user);

  // Collision-resistant ticket code (unique index will still reject true dups)
  const ticketId = `TKT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  let ticket;
  try {
    ticket = await SupportRepository.createTicket({
    ticketId,
    user: userId as any,
    userRole,
    subject,
    status: TicketStatus.OPEN,
    lastMessage: initialMessage,
    unreadByAdmin: true,
    unreadByUser: false,
    });
  } catch (err: any) {
    // Retry once on unique ticketId collision
    if (err?.code === 11000) {
      ticket = await SupportRepository.createTicket({
        ticketId: `TKT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        user: userId as any,
        userRole,
        subject,
        status: TicketStatus.OPEN,
        lastMessage: initialMessage,
        unreadByAdmin: true,
        unreadByUser: false,
      });
    } else {
      throw err;
    }
  }

  await SupportRepository.createMessage({
    ticket: ticket._id,
    sender: userId,
    senderRole: userRole,
    content: initialMessage,
  });

  const subjectPreview =
    subject.length > 60 ? `${subject.slice(0, 60)}…` : subject;
  notifyAdmins(
    "New support ticket",
    `${userRole === "helper" ? "Helper" : "Client"}: ${subjectPreview}`,
    {
      type: "support_reply",
      ticketId: String(ticket._id),
      ticketCode: ticket.ticketId || "",
    },
  ).catch(() => {});

  return ticket;
};

// ─── Get User Tickets ────────────────────────────────────
const getUserTickets = async (userId: string) => {
  const tickets = await SupportRepository.findTicketsByUser(userId);
  return tickets.map(resolveTicketUrls);
};

// ─── Get Ticket Details & Messages ───────────────────────
const getTicketDetails = async (userId: string, ticketId: string, isAdmin = false) => {
  const ticket = await SupportRepository.findTicketById(ticketId);
  if (!ticket) {
    throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  }

  const ownerId = String(
    typeof ticket.user === "object" && ticket.user !== null && "_id" in ticket.user
      ? (ticket.user as any)._id
      : ticket.user,
  );

  if (!isAdmin && ownerId !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Access denied to this support ticket");
  }

  // Clear unread flags when the ticket is opened
  if (isAdmin && ticket.unreadByAdmin) {
    await SupportRepository.updateUnreadFlags(ticketId, { unreadByAdmin: false });
    ticket.unreadByAdmin = false;
  } else if (!isAdmin && ticket.unreadByUser) {
    await SupportRepository.updateUnreadFlags(ticketId, { unreadByUser: false });
    ticket.unreadByUser = false;
  }

  const messages = await SupportRepository.findMessagesByTicket(ticketId);
  return {
    ticket: resolveTicketUrls(ticket),
    messages: resolveMessageUrls(messages),
  };
};

// ─── Send Support Message ────────────────────────────────
const sendMessage = async (
  userId: string,
  ticketId: string,
  content: string,
  attachments: string[] = [],
  userRole: "user" | "helper" | "admin" = "user"
) => {
  const ticket = await SupportRepository.findTicketById(ticketId);
  if (!ticket) {
    throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  }

  const isFromAdmin = userRole === "admin";
  const ownerId = String(
    typeof ticket.user === "object" && ticket.user !== null && "_id" in ticket.user
      ? (ticket.user as any)._id
      : ticket.user,
  );

  // Only ticket owner (or admin/staff) may write
  if (!isFromAdmin && ownerId !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Access denied to this support ticket");
  }

  // Resolved tickets are read-only for the user (admin can still reopen via status)
  if (!isFromAdmin && ticket.status === TicketStatus.RESOLVED) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This ticket is resolved. Create a new ticket for a new issue.",
    );
  }

  // Keep ticket.userRole in sync if owner became a helper later
  if (!isFromAdmin) {
    try {
      const owner = await UserRepository.findById(userId, { populate: "auth" });
      const liveRole = resolveLiveUserRole(owner);
      if (liveRole === "helper" && ticket.userRole !== "helper") {
        const { SupportTicket } = await import("./support.model");
        await SupportTicket.findByIdAndUpdate(ticketId, { $set: { userRole: liveRole } });
      }
    } catch (_) {}
  }

  const trimmed = (content || "").trim();
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  if (!trimmed && safeAttachments.length === 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Message content or at least one attachment is required",
    );
  }

  const message = await SupportRepository.createMessage({
    ticket: ticketId,
    sender: userId,
    senderRole: userRole,
    content: trimmed,
    attachments: safeAttachments.map(resolveUrl).filter(Boolean),
  });

  await SupportRepository.updateLastMessage(
    ticketId,
    trimmed || (safeAttachments.length ? "📎 Attachment" : ""),
    isFromAdmin,
  );

  // Push notification when support replies to the ticket owner
  if (isFromAdmin) {
    const ticketOwnerId =
      typeof ticket.user === "object" && ticket.user !== null && "_id" in ticket.user
        ? String((ticket.user as any)._id)
        : String(ticket.user);

    const previewSrc = trimmed || "📎 Attachment";
    const preview =
      previewSrc.length > 80 ? `${previewSrc.slice(0, 80)}…` : previewSrc;

    logger.info("[FCM] support admin reply → notifyUser", {
      ticketId,
      ticketOwnerId,
    });

    notifyUser(
      ticketOwnerId,
      "Support replied",
      preview || `New message on ticket ${ticket.ticketId || ticketId}`,
      {
        type: "support_reply",
        ticketId: String(ticket._id || ticketId),
        ticketCode: ticket.ticketId || "",
      },
    ).catch(() => {});
  } else {
    // User/helper message → alert admin inbox
    const previewSrc = trimmed || "📎 Attachment";
    const preview =
      previewSrc.length > 80 ? `${previewSrc.slice(0, 80)}…` : previewSrc;
    logger.info("[FCM] support user message → notifyAdmins", {
      ticketId,
      userRole,
    });
    notifyAdmins(
      "Support message",
      `${userRole === "helper" ? "Helper" : "Client"}: ${preview}`,
      {
        type: "support_reply",
        ticketId: String(ticket._id || ticketId),
        ticketCode: ticket.ticketId || "",
      },
    ).catch(() => {});
  }

  return message;
};

// ─── Admin: List All Tickets ─────────────────────────────
const getAllTickets = async (status?: string, userRole?: "user" | "helper", page = 1, limit = 20) => {
  const filter: any = {};
  if (status) filter.status = status;
  if (userRole) filter.userRole = userRole;

  const result = await SupportRepository.findAllTickets(filter, page, limit);
  return {
    ...result,
    docs: result.docs.map(resolveTicketUrls),
  };
};

// ─── Admin: Update Ticket Status ─────────────────────────
const updateTicketStatus = async (ticketId: string, status: TicketStatus) => {
  const ticket = await SupportRepository.updateTicketStatus(ticketId, status);
  if (!ticket) {
    throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  }

  const ownerId = String(
    typeof ticket.user === "object" && ticket.user !== null && "_id" in ticket.user
      ? (ticket.user as any)._id
      : ticket.user,
  );

  const statusLabel =
    status === TicketStatus.RESOLVED
      ? "resolved"
      : status === TicketStatus.IN_PROGRESS
        ? "in progress"
        : "open";

  notifyUser(
    ownerId,
    "Support ticket updated",
    `Ticket ${ticket.ticketId || ticketId} is now ${statusLabel}.`,
    {
      type: "support_reply",
      ticketId: String(ticket._id || ticketId),
      ticketCode: ticket.ticketId || "",
      status,
    },
  ).catch(() => {});

  return ticket;
};

/** Lightweight helper for socket emit — returns owner user id string. */
const getTicketOwnerForEmit = async (ticketId: string): Promise<string | null> => {
  const ticket = await SupportRepository.findTicketById(ticketId);
  if (!ticket?.user) return null;
  return String(
    typeof ticket.user === "object" && "_id" in ticket.user
      ? (ticket.user as any)._id
      : ticket.user,
  );
};

export const SupportService = {
  createTicket,
  getUserTickets,
  getTicketDetails,
  sendMessage,
  getAllTickets,
  updateTicketStatus,
  getTicketOwnerForEmit,
};
