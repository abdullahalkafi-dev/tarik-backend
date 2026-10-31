import { Router } from "express";
import auth, { requirePermission, requireStaffPermission } from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { messageLimiter, supportTicketLimiter } from "@middlewares/security";
import { SupportController } from "./support.controller";
import { SupportDto } from "./support.dto";

const router = Router();

const staff = auth("admin", "superAdmin", "staff");
const canHandle = requirePermission("support.manage");

/**
 * @route   POST /api/v1/support/tickets
 * @desc    Create support ticket (10 per day per user)
 * @access  Private (user/helper)
 */
router.post(
  "/tickets",
  auth(),
  supportTicketLimiter,
  validateRequest(SupportDto.createTicket),
  SupportController.createTicket,
);

/**
 * @route   GET /api/v1/support/tickets
 * @desc    Get user's support tickets
 * @access  Private (user/helper)
 */
router.get("/tickets", auth(), SupportController.getUserTickets);

/**
 * @route   GET /api/v1/support/tickets/admin/all
 * @desc    Tickets for the support console (filters, search, pagination)
 * @access  Private (staff, support.manage)
 */
router.get(
  "/tickets/admin/all",
  staff,
  canHandle,
  validateRequest(SupportDto.adminList),
  SupportController.getAllTickets,
);

/**
 * @route   GET /api/v1/support/tickets/:id
 * @desc    Get single ticket details and messages
 * @access  Private
 */
router.get(
  "/tickets/:id",
  auth(),
  requireStaffPermission("support.manage"),
  SupportController.getTicketDetails,
);

/**
 * @route   POST /api/v1/support/tickets/:id/messages
 * @desc    Send message in support ticket
 * @access  Private
 */
router.post(
  "/tickets/:id/messages",
  auth(),
  requireStaffPermission("support.manage"),
  messageLimiter,
  validateRequest(SupportDto.sendMessage),
  SupportController.sendMessage,
);

/**
 * @route   POST /api/v1/support/tickets/:id/reopen
 * @desc    Customer reopens a resolved ticket (within 7 days)
 * @access  Private (ticket owner)
 */
router.post("/tickets/:id/reopen", auth(), SupportController.reopenTicket);

/**
 * @route   PATCH /api/v1/support/tickets/:id/status
 * @desc    Update ticket status (admin)
 * @access  Private (staff, support.manage)
 */
router.patch(
  "/tickets/:id/status",
  staff,
  canHandle,
  validateRequest(SupportDto.updateStatus),
  SupportController.updateTicketStatus,
);

/**
 * @route   PATCH /api/v1/support/tickets/:id
 * @desc    Priority / category / assignee (admin)
 * @access  Private (staff, support.manage)
 */
router.patch(
  "/tickets/:id",
  staff,
  canHandle,
  validateRequest(SupportDto.updateTicket),
  SupportController.updateTicketMeta,
);

/**
 * @route   POST /api/v1/support/tickets/:id/notes
 * @desc    Private staff note (admin)
 * @access  Private (staff, support.manage)
 */
router.post(
  "/tickets/:id/notes",
  staff,
  canHandle,
  validateRequest(SupportDto.addNote),
  SupportController.addNote,
);

export const SupportRoutes = router;
