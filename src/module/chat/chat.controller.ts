import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { ChatService } from "./chat.service";
import {
  emitToConversation,
  emitToUser,
} from "../../socket/socket.gateway";
import { ChatRepository } from "./chat.repository";

const uid = (req: any) => String(req.user?._id);
const p = (req: any, key: string) => String(req.params[key]);

// ─── List Conversations ────────────────────────────────
const listConversations = catchAsync(async (req, res) => {
  const result = await ChatService.listConversations(uid(req));

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Conversations fetched successfully",
    data: result,
  });
});

// ─── Create or Get Conversation ────────────────────────
const createOrGetConversation = catchAsync(async (req, res) => {
  const result = await ChatService.createOrGetConversation(
    uid(req),
    req.body.participantId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Conversation ready",
    data: result,
  });
});

// ─── Get Messages ──────────────────────────────────────
const getMessages = catchAsync(async (req, res) => {
  const result = await ChatService.getMessages(
    p(req, "conversationId"),
    uid(req),
    {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      before: req.query.before as string | undefined,
    },
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Messages fetched successfully",
    data: result,
  });
});

// ─── Send Message ──────────────────────────────────────
const sendMessage = catchAsync(async (req, res) => {
  const conversationId = p(req, "conversationId");
  const senderId = uid(req);
  const result = await ChatService.sendMessage(conversationId, senderId, req.body);

  // Real-time delivery for REST path (Flutter uses REST, not socket chat:send)
  emitToConversation(conversationId, "chat:receive", result);
  try {
    const conversation = await ChatRepository.findConversationById(conversationId);
    const other = (conversation?.participants || []).find(
      (part: any) => String(part._id ?? part) !== senderId,
    );
    if (other) {
      const otherId = String(other._id ?? other);
      emitToUser(otherId, "chat:conversation_updated", {
        conversationId,
        lastMessage: result,
      });
    }
  } catch (_) {}

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Message sent successfully",
    data: result,
  });
});

// ─── Send Offer ────────────────────────────────────────
const sendOffer = catchAsync(async (req, res) => {
  const conversationId = p(req, "conversationId");
  const senderId = uid(req);
  const result = await ChatService.sendOffer(conversationId, senderId, req.body);

  emitToConversation(conversationId, "chat:receive", result);
  try {
    const conversation = await ChatRepository.findConversationById(conversationId);
    const other = (conversation?.participants || []).find(
      (part: any) => String(part._id ?? part) !== senderId,
    );
    if (other) {
      const otherId = String(other._id ?? other);
      emitToUser(otherId, "chat:conversation_updated", {
        conversationId,
        lastMessage: result,
      });
    }
  } catch (_) {}

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Offer sent successfully",
    data: result,
  });
});

// ─── Accept Offer ──────────────────────────────────────
const acceptOffer = catchAsync(async (req, res) => {
  const result = await ChatService.acceptOffer(
    p(req, "conversationId"),
    uid(req),
    p(req, "offerId"),
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Offer accepted successfully",
    data: result,
  });
});

// ─── Reject Offer ──────────────────────────────────────
const rejectOffer = catchAsync(async (req, res) => {
  const result = await ChatService.rejectOffer(
    p(req, "conversationId"),
    uid(req),
    p(req, "offerId"),
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Offer rejected",
    data: result,
  });
});

// ─── Cancel Offer ──────────────────────────────────────
const cancelOffer = catchAsync(async (req, res) => {
  const result = await ChatService.cancelOffer(
    p(req, "conversationId"),
    uid(req),
    p(req, "offerId"),
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Offer cancelled",
    data: result,
  });
});

// ─── Edit Offer ────────────────────────────────────────
const editOffer = catchAsync(async (req, res) => {
  const result = await ChatService.editOffer(
    p(req, "conversationId"),
    uid(req),
    p(req, "offerId"),
    req.body,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Offer updated successfully",
    data: result,
  });
});

// ─── Mark Read ─────────────────────────────────────────
const markRead = catchAsync(async (req, res) => {
  const result = await ChatService.markRead(
    p(req, "conversationId"),
    uid(req),
    req.body.messageIds,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Messages marked as read",
    data: result,
  });
});

export const ChatController = {
  listConversations,
  createOrGetConversation,
  getMessages,
  sendMessage,
  sendOffer,
  acceptOffer,
  rejectOffer,
  cancelOffer,
  editOffer,
  markRead,
};
