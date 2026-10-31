import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { SupportRepository } from "./support.repository";
import { SupportTicket } from "./support.model";
import { TicketStatus, TicketCategory, TicketPriority } from "./support.interface";
import { UserRepository } from "module/user/user.repository";
import { User } from "module/user/user.model";
import { Job } from "module/job/job.model";
import { resolveUrl } from "util/minio";
import { notifyUserT } from "util/notifyUser";
import { notifyAdmins } from "util/notifyAdmins";
import { assertOwnUploadKeys } from "util/uploadKey";
import { emitToUser, getSocketServer } from "../../socket/socket.gateway";

const REOPEN_WINDOW_DAYS = 7;
const idOf = (v: any): string => String(v?._id ?? v ?? "");

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

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── Helper: Resolve avatar URLs in ticket/user objects ─────
const resolveTicketUrls = (ticket: any, opts: { forStaff?: boolean; viewerId?: string } = {}) => {
  if (!ticket) return ticket;
  const t = ticket.toObject ? ticket.toObject() : ticket;
  if (t.user) {
    const liveRole = resolveLiveUserRole(t.user);
    t.userRole = liveRole;
    t.user = {
      ...t.user,
      role: liveRole,
      avatar: resolveUrl(t.user.avatar),
    };
    // Customers never need other people's e-mail; only the staff console does.
    if (!opts.forStaff) delete t.user.email;
  }
  if (t.assignee?.avatar) t.assignee = { ...t.assignee, avatar: resolveUrl(t.assignee.avatar) };
  if (t.reportedUser?.avatar) t.reportedUser = { ...t.reportedUser, avatar: resolveUrl(t.reportedUser.avatar) };
  if (opts.forStaff && opts.viewerId) {
    // "Unread" is per agent: unread until THIS agent opened the latest message.
    t.unreadByAdmin = t.unreadByAdmin && !(t.adminReadBy || []).some((a: any) => idOf(a) === opts.viewerId);
  }
  if (!opts.forStaff) {
    delete t.internalNotes;
    delete t.adminReadBy;
    delete t.assignee;
    delete t.priority;
  }
  return t;
};

const resolveMessageUrls = (messages: any[]) => {
  return messages.map((m) => {
    const msg = m.toObject ? m.toObject() : m;
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

const defaultPriority = (category: TicketCategory): TicketPriority =>
  category === "safety" ? "urgent" : category === "payment" || category === "job" || category === "kyc" ? "high" : "normal";

// ─── Create Ticket ───────────────────────────────────────
const createTicket = async (
  userId: string,
  input: {
    subject: string;
    message: string;
    category?: TicketCategory;
    jobId?: string;
    reportedUserId?: string;
    attachments?: string[];
  },
) => {
  const user = await UserRepository.findById(userId, { populate: "auth" });
  if (!user) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  const userRole = resolveLiveUserRole(user);
  const category: TicketCategory = input.category || (input.jobId ? "job" : "other");

  // A ticket about a job must come from somebody who is part of that job.
  if (input.jobId) {
    const job = await Job.findById(input.jobId).select("postedBy assignedTo").lean();
    if (!job || (idOf(job.postedBy) !== String(userId) && idOf(job.assignedTo) !== String(userId))) {
      throw new AppError(StatusCodes.FORBIDDEN, "You can only report problems about your own jobs");
    }
  }
  if (input.reportedUserId && !(await User.exists({ _id: input.reportedUserId }))) {
    throw new AppError(StatusCodes.NOT_FOUND, "Reported user not found");
  }

  const attachments = assertOwnUploadKeys(input.attachments, userId, { kinds: ["images", "videos"] });

  // Collision-resistant ticket code (unique index will still reject true dups)
  const makeCode = () =>
    `TKT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const base = {
    user: userId as any,
    userRole,
    subject: input.subject,
    status: TicketStatus.OPEN,
    category,
    priority: defaultPriority(category),
    ...(input.jobId ? { job: input.jobId as any } : {}),
    ...(input.reportedUserId ? { reportedUser: input.reportedUserId as any } : {}),
    lastMessage: input.message,
    unreadByAdmin: true,
    unreadByUser: false,
    adminReadBy: [],
  };

  let ticket;
  try {
    ticket = await SupportRepository.createTicket({ ticketId: makeCode(), ...base } as any);
  } catch (err: any) {
    if (err?.code === 11000) {
      ticket = await SupportRepository.createTicket({ ticketId: makeCode(), ...base } as any);
    } else {
      throw err;
    }
  }

  await SupportRepository.createMessage({
    ticket: ticket._id,
    sender: userId,
    senderRole: userRole,
    content: input.message,
    attachments,
  });

  const subjectPreview = input.subject.length > 60 ? `${input.subject.slice(0, 60)}…` : input.subject;
  notifyAdmins(
    "New support ticket",
    `${userRole === "helper" ? "Helper" : "Client"}: ${subjectPreview}`,
    {
      type: "support_reply",
      ticketId: String(ticket._id),
      ticketCode: ticket.ticketId || "",
    },
    "support.manage",
    "customerServiceTickets",
  ).catch(() => undefined);

  // Live inbox: staff watching the Support page see it without polling.
  getSocketServer()?.to("support:admins").emit("support:ticket_created", {
    ticketId: String(ticket._id),
    ticketCode: ticket.ticketId,
    category,
  });

  return ticket;
};

// ─── Get User Tickets ────────────────────────────────────
const getUserTickets = async (userId: string) => {
  const tickets = await SupportRepository.findTicketsByUser(userId);
  return tickets.map((t) => resolveTicketUrls(t));
};

// ─── Get Ticket Details & Messages ───────────────────────
const getTicketDetails = async (userId: string, ticketId: string, isAdmin = false) => {
  const ticket = await SupportRepository.findTicketById(ticketId);
  if (!ticket) {
    throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  }

  const ownerId = idOf(ticket.user);

  if (!isAdmin && ownerId !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Access denied to this support ticket");
  }

  // Opening the ticket clears the unread marker for the person who opened it.
  if (isAdmin) {
    await SupportRepository.markReadByAdmin(ticketId, userId);
  } else if (ticket.unreadByUser) {
    await SupportRepository.clearUserUnread(ticketId);
    ticket.unreadByUser = false;
  }

  const messages = await SupportRepository.findMessagesByTicket(ticketId);
  return {
    ticket: resolveTicketUrls(ticket, { forStaff: isAdmin, viewerId: String(userId) }),
    messages: resolveMessageUrls(messages),
  };
};

// ─── Send Support Message ────────────────────────────────
const sendMessage = async (
  userId: string,
  ticketId: string,
  content: string,
  attachments: string[] = [],
  userRole: "user" | "helper" | "admin" = "user",
) => {
  const ticket = await SupportRepository.findTicketById(ticketId);
  if (!ticket) {
    throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  }

  const isFromAdmin = userRole === "admin";
  const ownerId = idOf(ticket.user);

  // Only ticket owner (or admin/staff) may write
  if (!isFromAdmin && ownerId !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Access denied to this support ticket");
  }

  // Resolved tickets are read-only for the user (they can reopen within a week)
  if (!isFromAdmin && ticket.status === TicketStatus.RESOLVED) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This ticket is resolved. Reopen it or create a new ticket.",
      { code: "TICKET_RESOLVED" },
    );
  }

  const trimmed = (content || "").trim();
  const safeAttachments = assertOwnUploadKeys(attachments, userId, {
    kinds: ["images", "videos"],
    isStaff: isFromAdmin,
  });
  if (!trimmed && safeAttachments.length === 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Message content or at least one attachment is required");
  }

  const message = await SupportRepository.createMessage({
    ticket: ticketId,
    sender: userId,
    senderRole: userRole,
    content: trimmed,
    attachments: safeAttachments,
  });

  await SupportRepository.updateLastMessage(
    ticketId,
    trimmed || (safeAttachments.length ? "📎" : ""),
    isFromAdmin,
    isFromAdmin ? userId : undefined,
  );

  // An agent's first reply moves an open ticket to "in progress" and assigns it.
  if (isFromAdmin && ticket.status === TicketStatus.OPEN) {
    await SupportRepository.updateFields(ticketId, {
      status: TicketStatus.IN_PROGRESS,
      ...(ticket.assignee ? {} : { assignee: userId }),
    });
  }

  const previewSrc = trimmed || "📎";
  const preview = previewSrc.length > 80 ? `${previewSrc.slice(0, 80)}…` : previewSrc;

  if (isFromAdmin) {
    notifyUserT(
      ownerId,
      "support.reply",
      { preview },
      {
        type: "support_reply",
        ticketId: String(ticket._id || ticketId),
        ticketCode: ticket.ticketId || "",
      },
    ).catch(() => undefined);
  } else {
    notifyAdmins(
      "Support message",
      `${userRole === "helper" ? "Helper" : "Client"}: ${preview}`,
      {
        type: "support_reply",
        ticketId: String(ticket._id || ticketId),
        ticketCode: ticket.ticketId || "",
      },
      "support.manage",
      "customerServiceTickets",
    ).catch(() => undefined);
  }

  return message;
};

// ─── Admin: List All Tickets ─────────────────────────────
const getAllTickets = async (
  viewerId: string,
  q: {
    status?: string;
    userRole?: "user" | "helper";
    category?: string;
    priority?: string;
    assignee?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
) => {
  const filter: any = {};
  if (q.status) filter.status = q.status;
  if (q.userRole) filter.userRole = q.userRole;
  if (q.category) filter.category = q.category;
  if (q.priority) filter.priority = q.priority;
  if (q.assignee === "me") filter.assignee = viewerId;
  else if (q.assignee === "none") filter.assignee = { $exists: false };
  else if (q.assignee && /^[0-9a-fA-F]{24}$/.test(q.assignee)) filter.assignee = q.assignee;

  if (q.search) {
    const re = { $regex: escapeRegex(q.search), $options: "i" };
    const people = await User.find({ $or: [{ name: re }, { phone: re }] }).select("_id").limit(100).lean();
    filter.$or = [
      { subject: re },
      { ticketId: re },
      ...(people.length ? [{ user: { $in: people.map((p) => p._id) } }] : []),
    ];
  }

  const result = await SupportRepository.findAllTickets(filter, q.page || 1, Math.min(q.limit || 20, 100));
  return {
    ...result,
    docs: result.docs.map((t) => resolveTicketUrls(t, { forStaff: true, viewerId })),
  };
};

// ─── Admin: Update Ticket Status ─────────────────────────
const statusTemplate: Record<string, string> = {
  resolved: "support.status_resolved",
  in_progress: "support.status_in_progress",
  open: "support.status_open",
};

const updateTicketStatus = async (ticketId: string, status: TicketStatus) => {
  const ticket = await SupportRepository.updateTicketStatus(ticketId, status);
  if (!ticket) {
    throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  }

  const ownerId = idOf(ticket.user);
  notifyUserT(
    ownerId,
    statusTemplate[status] || "support.status_open",
    { code: ticket.ticketId || ticketId },
    {
      type: "support_reply",
      ticketId: String(ticket._id || ticketId),
      ticketCode: ticket.ticketId || "",
      status,
    },
  ).catch(() => undefined);
  emitToUser(ownerId, "support:status", { ticketId: String(ticket._id), status });

  return ticket;
};

/** Admin: priority / category / assignee. */
const updateTicketMeta = async (
  ticketId: string,
  fields: { priority?: TicketPriority; category?: TicketCategory; assignee?: string | null },
) => {
  const set: Record<string, unknown> = {};
  if (fields.priority) set.priority = fields.priority;
  if (fields.category) set.category = fields.category;
  if (fields.assignee !== undefined) {
    if (fields.assignee) {
      const ok = await UserRepository.exists({ _id: fields.assignee });
      if (!ok) throw new AppError(StatusCodes.NOT_FOUND, "Assignee not found");
      set.assignee = fields.assignee;
    } else {
      await SupportTicket.updateOne({ _id: ticketId }, { $unset: { assignee: 1 } });
    }
  }
  const ticket = Object.keys(set).length
    ? await SupportRepository.updateFields(ticketId, set)
    : await SupportRepository.findTicketById(ticketId);
  if (!ticket) throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  return ticket;
};

/** Admin: private remark on a ticket. */
const addInternalNote = async (ticketId: string, adminId: string, text: string) => {
  const admin = await UserRepository.findById(adminId, { select: "name" });
  const ticket = await SupportRepository.addNote(ticketId, { by: adminId, byName: admin?.name, text });
  if (!ticket) throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  return ticket.internalNotes;
};

/** Customer: reopen a resolved ticket (within a week). */
const reopenTicket = async (userId: string, ticketId: string) => {
  const ticket = await SupportRepository.findTicketById(ticketId);
  if (!ticket) throw new AppError(StatusCodes.NOT_FOUND, "Support ticket not found");
  if (idOf(ticket.user) !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Access denied to this support ticket");
  }
  if (ticket.status !== TicketStatus.RESOLVED) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This ticket is not resolved");
  }
  if (
    ticket.resolvedAt &&
    Date.now() - new Date(ticket.resolvedAt).getTime() > REOPEN_WINDOW_DAYS * 86_400_000
  ) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This ticket is too old to reopen. Please create a new one.", {
      code: "REOPEN_WINDOW_PASSED",
    });
  }
  const updated = await SupportRepository.updateTicketStatus(ticketId, TicketStatus.OPEN);
  await SupportRepository.updateFields(ticketId, { unreadByAdmin: true, adminReadBy: [] });
  notifyAdmins(
    "Ticket reopened",
    `${ticket.ticketId || ticketId} was reopened by the customer`,
    { type: "support_reply", ticketId: String(ticket._id), ticketCode: ticket.ticketId || "" },
    "support.manage",
  ).catch(() => undefined);
  return updated;
};

/** Lightweight helper for socket emit — returns owner user id string. */
const getTicketOwnerForEmit = async (ticketId: string): Promise<string | null> => {
  const ticket = await SupportRepository.findTicketById(ticketId);
  if (!ticket?.user) return null;
  return idOf(ticket.user);
};

export const SupportService = {
  createTicket,
  getUserTickets,
  getTicketDetails,
  sendMessage,
  getAllTickets,
  updateTicketStatus,
  updateTicketMeta,
  addInternalNote,
  reopenTicket,
  getTicketOwnerForEmit,
};
