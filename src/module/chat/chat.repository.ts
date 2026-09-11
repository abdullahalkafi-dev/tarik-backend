import { Types } from "mongoose";
import { Conversation } from "./conversation.model";
import { Message } from "./message.model";
import { TConversation, TMessage } from "./chat.interface";
import { resolveUrl } from "../../util/minio";

// ─── Conversation Repository ───────────────────────────
const createConversation = async (
  participantIds: string[],
): Promise<TConversation> => {
  const objectIds = participantIds.map((id) => new Types.ObjectId(id));

  // 1. Try to find existing conversation with exactly these participants
  let conversation = await Conversation.findOne({
    participants: { $all: objectIds, $size: objectIds.length },
  });

  // 2. If not found, create new one
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        participants: objectIds,
        unreadCounts: {},
      });
    } catch (err: any) {
      // Race condition or existing conversation
      conversation = await Conversation.findOne({
        participants: { $all: objectIds, $size: objectIds.length },
      });
      if (!conversation) {
        throw err;
      }
    }
  }

  // Populate participants so Flutter can read name/avatar
  const populated = await Conversation.findById(conversation._id)
    .populate("participants", "name avatar")
    .populate("lastMessage");

  return (populated || conversation) as TConversation;
};

const findConversationById = async (
  conversationId: string,
): Promise<TConversation | null> => {
  return Conversation.findById(conversationId)
    .populate("participants", "name avatar")
    .populate("lastMessage");
};

const findUserConversations = async (userId: string) => {
  return Conversation.find({ participants: userId })
    .populate("participants", "name avatar")
    .populate("lastMessage")
    .sort({ lastMessageAt: -1 });
};

const updateConversationLastMessage = async (
  conversationId: string,
  messageId: Types.ObjectId,
  senderId: string,
) => {
  // Fetch conversation to find other participants
  const conversation = await Conversation.findById(conversationId).select("participants");
  if (!conversation) return;

  // Build atomic update
  const update: any = {
    $set: {
      lastMessage: messageId,
      lastMessageAt: new Date(),
    },
  };

  // Increment unread count for all participants except sender
  for (const participantId of conversation.participants) {
    if (String(participantId) !== senderId) {
      update.$inc = update.$inc || {};
      update.$inc[`unreadCounts.${String(participantId)}`] = 1;
    }
  }

  await Conversation.findByIdAndUpdate(conversationId, update);
};

/**
 * Mark conversation read for a user.
 * Always $set 0 — opening a thread means "no unread left".
 * Avoids negative counters under concurrent getMessages/markRead.
 */
const markConversationRead = async (
  conversationId: string,
  userId: string,
  _unreadCount: number = 0,
) => {
  await Conversation.findByIdAndUpdate(conversationId, {
    $set: { [`unreadCounts.${userId}`]: 0 },
  });
};

// ─── Message Repository ────────────────────────────────
const resolveMessageUrls = (msg: any) => {
  if (msg.sender?.avatar) {
    msg.sender.avatar = resolveUrl(msg.sender.avatar);
  }
  if (msg.images?.length) {
    msg.images = msg.images.map((img: string) => resolveUrl(img));
  }
  if (msg.video) {
    msg.video = resolveUrl(msg.video);
  }
  if (msg.offerData?.images?.length) {
    msg.offerData.images = msg.offerData.images.map((img: string) => resolveUrl(img));
  }
  return msg;
};

const createMessage = async (data: Partial<TMessage>): Promise<TMessage> => {
  return Message.create(data);
};

const findMessagesByConversation = async (
  conversationId: string,
  options: { page: number; limit: number; before?: string },
) => {
  const filter: any = { conversation: conversationId };
  if (options.before) {
    filter.createdAt = { $lt: new Date(options.before) };
  }

  const total = await Message.countDocuments(filter);

  let messages;
  if (options.before) {
    // Load more (scroll up): get older messages, sort newest-first then reverse for oldest-first display
    messages = await Message.find(filter)
      .populate("sender", "name avatar")
      .sort({ createdAt: -1 })
      .limit(options.limit);
    messages.reverse();
  } else {
    // Initial load: get the LATEST messages (newest first, limit, then reverse for oldest-first display)
    messages = await Message.find(filter)
      .populate("sender", "name avatar")
      .sort({ createdAt: -1 })
      .limit(options.limit);
    messages.reverse();
  }

  // Resolve MinIO keys to full URLs
  const resolved = messages.map((msg) => resolveMessageUrls(msg.toObject()));

  return {
    docs: resolved,
    total,
    page: options.page,
    limit: options.limit,
    totalPages: Math.ceil(total / options.limit),
  };
};

const markMessagesRead = async (
  conversationId: string,
  userId: string,
  messageIds: string[],
) => {
  await Message.updateMany(
    {
      _id: { $in: messageIds },
      conversation: conversationId,
      "readBy.userId": { $ne: userId },
    },
    {
      $push: {
        readBy: { userId, readAt: new Date() },
      },
    },
  );
};

const findMessageById = async (messageId: string): Promise<TMessage | null> => {
  return Message.findById(messageId);
};

/**
 * Atomically transition offer status from one of `fromStatuses`.
 * Returns null if already transitioned (idempotent guard for accept/reject/cancel).
 */
const claimOfferStatus = async (
  messageId: string,
  status: string,
  fromStatuses: string[] = ["pending"],
  acceptedJobId?: string,
) => {
  const update: Record<string, unknown> = { "offerData.status": status };
  if (acceptedJobId) {
    update["offerData.acceptedJobId"] = acceptedJobId;
  }
  const filter = {
    _id: messageId,
    type: "offer",
    "offerData.status": { $in: fromStatuses },
  } as Record<string, unknown>;
  return Message.findOneAndUpdate(filter, { $set: update }, { new: true });
};

/**
 * Atomically transition offer status only from PENDING.
 * Returns null if already transitioned (idempotent guard for accept/reject/cancel).
 */
const updateOfferStatusIfPending = async (
  messageId: string,
  status: string,
  acceptedJobId?: string,
) => {
  return claimOfferStatus(messageId, status, ["pending"], acceptedJobId);
};

const updateOfferStatus = async (
  messageId: string,
  status: string,
  acceptedJobId?: string,
) => {
  const update: any = { "offerData.status": status };
  if (acceptedJobId) {
    update["offerData.acceptedJobId"] = acceptedJobId;
  }
  return Message.findByIdAndUpdate(messageId, { $set: update }, { new: true });
};

const updateOfferData = async (
  messageId: string,
  offerData: Partial<any>,
) => {
  const setFields: any = {};
  if (!offerData) return null;
  if (offerData.title !== undefined) setFields["offerData.title"] = offerData.title;
  if (offerData.description !== undefined) setFields["offerData.description"] = offerData.description;
  if (offerData.price !== undefined) setFields["offerData.price"] = offerData.price;
  if (offerData.priceType !== undefined) setFields["offerData.priceType"] = offerData.priceType;
  if (offerData.date !== undefined) setFields["offerData.date"] = offerData.date;
  if (offerData.startTime !== undefined) setFields["offerData.startTime"] = offerData.startTime;
  if (offerData.endTime !== undefined) setFields["offerData.endTime"] = offerData.endTime;
  if (offerData.address !== undefined) setFields["offerData.address"] = offerData.address;
  if (offerData.location !== undefined) setFields["offerData.location"] = offerData.location;
  if (offerData.paymentMethod !== undefined) setFields["offerData.paymentMethod"] = offerData.paymentMethod;
  if (offerData.images !== undefined) setFields["offerData.images"] = offerData.images;

  return Message.findByIdAndUpdate(messageId, { $set: setFields }, { new: true });
};

/** Reset online offers stuck in AWAITING_PAYMENT longer than hours back to PENDING. */
const expireStuckAwaitingPayment = async (hours = 24): Promise<number> => {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const res = await Message.updateMany(
    {
      type: "offer",
      "offerData.status": "awaiting_payment",
      updatedAt: { $lte: cutoff },
    } as any,
    { $set: { "offerData.status": "pending" } },
  );
  return res.modifiedCount || 0;
};

const findUnreadMessages = async (conversationId: string, userId: string) => {
  return Message.find({
    conversation: conversationId,
    sender: { $ne: userId },
    "readBy.userId": { $ne: userId },
  }).select("_id");
};

export const ChatRepository = {
  createConversation,
  findConversationById,
  findUserConversations,
  updateConversationLastMessage,
  markConversationRead,
  createMessage,
  findMessagesByConversation,
  markMessagesRead,
  findMessageById,
  updateOfferStatus,
  updateOfferStatusIfPending,
  claimOfferStatus,
  updateOfferData,
  expireStuckAwaitingPayment,
  findUnreadMessages,
};
