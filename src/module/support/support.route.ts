import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { SupportController } from "./support.controller";
import { SupportDto } from "./support.dto";

const router = Router();

/**
 * @route   POST /api/v1/support/tickets
 * @desc    Create support ticket
 * @access  Private (user/helper)
 */
router.post(
  "/tickets",
  auth(),
  validateRequest(SupportDto.createTicket),
  SupportController.createTicket
);

/**
 * @route   GET /api/v1/support/tickets
 * @desc    Get user's support tickets
 * @access  Private (user/helper)
 */
router.get("/tickets", auth(), SupportController.getUserTickets);

/**
 * @route   GET /api/v1/support/tickets/admin/all
 * @desc    Get all tickets (admin)
 * @access  Private (admin)
 */
router.get(
  "/tickets/admin/all",
  auth("admin", "superAdmin", "staff"),
  SupportController.getAllTickets,
);

/**
 * @route   GET /api/v1/support/tickets/:id
 * @desc    Get single ticket details and messages
 * @access  Private
 */
router.get("/tickets/:id", auth(), SupportController.getTicketDetails);

/**
 * @route   POST /api/v1/support/tickets/:id/messages
 * @desc    Send message in support ticket
 * @access  Private
 */
router.post(
  "/tickets/:id/messages",
  auth(),
  validateRequest(SupportDto.sendMessage),
  SupportController.sendMessage
);

/**
 * @route   PATCH /api/v1/support/tickets/:id/status
 * @desc    Update ticket status (admin)
 * @access  Private (admin)
 */
router.patch(
  "/tickets/:id/status",
  auth("admin", "superAdmin", "staff"),
  validateRequest(SupportDto.updateStatus),
  SupportController.updateTicketStatus
);

export const SupportRoutes = router;
