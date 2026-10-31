import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { createContentLimiter, messageLimiter } from "@middlewares/security";
import { ChatController } from "./chat.controller";
import { ChatDto } from "./chat.dto";

const router = Router();

/**
 * @route   GET /api/v1/chat/conversations
 * @desc    List user's conversations (only those with messages; online flag included)
 * @access  Private
 */
router.get(
  "/conversations",
  auth(),
  validateRequest(ChatDto.conversationListQuery),
  ChatController.listConversations,
);

/**
 * @route   GET /api/v1/chat/unread-count
 * @desc    Total unread messages (inbox badge)
 * @access  Private
 */
router.get("/unread-count", auth(), ChatController.getUnreadTotal);

/**
 * @route   GET /api/v1/chat/presence?ids=a,b
 * @desc    Online flags of people the caller shares a conversation with
 * @access  Private
 */
router.get("/presence", auth(), validateRequest(ChatDto.presenceQuery), ChatController.getPresence);

/**
 * @route   POST /api/v1/chat/conversations
 * @desc    Create or get existing conversation (client ↔ helper only)
 * @access  Private
 */
router.post(
  "/conversations",
  auth(),
  validateRequest(ChatDto.createConversation),
  ChatController.createOrGetConversation,
);

/**
 * @route   GET /api/v1/chat/conversations/:conversationId/messages
 * @desc    Get message history (cursor: ?before=<messageId>)
 * @access  Private
 */
router.get(
  "/conversations/:conversationId/messages",
  auth(),
  validateRequest(ChatDto.messageQuery),
  ChatController.getMessages,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/messages
 * @desc    Send a message (text, image, video)
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/messages",
  auth(),
  messageLimiter,
  validateRequest(ChatDto.sendMessageWithParams),
  ChatController.sendMessage,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/offer
 * @desc    Send a service offer
 * @access  Private (approved helper)
 */
router.post(
  "/conversations/:conversationId/offer",
  auth(),
  createContentLimiter,
  validateRequest(ChatDto.sendOfferWithParams),
  ChatController.sendOffer,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/offer/:offerId/accept
 * @desc    Accept an offer — the body carries the offer version the client saw
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/offer/:offerId/accept",
  auth(),
  validateRequest(ChatDto.acceptOffer),
  ChatController.acceptOffer,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/offer/:offerId/reject
 * @desc    Reject an offer
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/offer/:offerId/reject",
  auth(),
  validateRequest(ChatDto.offerActionParams),
  ChatController.rejectOffer,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/offer/:offerId/cancel
 * @desc    Cancel/withdraw an offer (sender only)
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/offer/:offerId/cancel",
  auth(),
  validateRequest(ChatDto.offerActionParams),
  ChatController.cancelOffer,
);

/**
 * @route   PATCH /api/v1/chat/conversations/:conversationId/offer/:offerId/edit
 * @desc    Edit an offer before acceptance (sender only; bumps the version)
 * @access  Private
 */
router.patch(
  "/conversations/:conversationId/offer/:offerId/edit",
  auth(),
  validateRequest(ChatDto.editOffer),
  ChatController.editOffer,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/read
 * @desc    Mark messages as read
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/read",
  auth(),
  validateRequest(ChatDto.markRead),
  ChatController.markRead,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/block | /unblock
 * @desc    Block / unblock the other person in this conversation
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/block",
  auth(),
  validateRequest(ChatDto.conversationParams),
  ChatController.blockConversation,
);
router.post(
  "/conversations/:conversationId/unblock",
  auth(),
  validateRequest(ChatDto.conversationParams),
  ChatController.unblockConversation,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/report
 * @desc    Report the other person (opens a support ticket)
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/report",
  auth(),
  createContentLimiter,
  validateRequest(ChatDto.reportConversation),
  ChatController.reportConversation,
);

export const ChatRoutes = router;
