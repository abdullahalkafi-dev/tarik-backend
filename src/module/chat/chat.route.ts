import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { ChatController } from "./chat.controller";
import { ChatDto } from "./chat.dto";

const router = Router();

/**
 * @route   GET /api/v1/chat/conversations
 * @desc    List user's conversations
 * @access  Private
 */
router.get("/conversations", auth(), ChatController.listConversations);

/**
 * @route   POST /api/v1/chat/conversations
 * @desc    Create or get existing conversation
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
 * @desc    Get paginated message history
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
  validateRequest(ChatDto.sendMessageWithParams),
  ChatController.sendMessage,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/offer
 * @desc    Send a service offer
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/offer",
  auth(),
  validateRequest(ChatDto.sendOfferWithParams),
  ChatController.sendOffer,
);

/**
 * @route   POST /api/v1/chat/conversations/:conversationId/offer/:offerId/accept
 * @desc    Accept an offer (creates job for cash, pending for online)
 * @access  Private
 */
router.post(
  "/conversations/:conversationId/offer/:offerId/accept",
  auth(),
  validateRequest(ChatDto.offerActionParams),
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
 * @desc    Edit an offer before acceptance (sender only)
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

export const ChatRoutes = router;
