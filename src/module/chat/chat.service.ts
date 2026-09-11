import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { ChatRepository } from "./chat.repository";
import { JobRepository } from "module/job/job.repository";
import { UserRepository } from "module/user/user.repository";
import { resolveUrl } from "../../util/minio";
import { notifyUser } from "../../util/notifyUser";
import { calcHourlyTotalMAD, parseHoursBetween } from "../../util/hourly";
import {
  MessageType,
  OfferStatus,
  PriceType,
  PaymentMethod,
} from "./chat.interface";
import { JobStatus } from "module/job/job.interface";

// ─── Helper: other participant id ──────────────────────
const getOtherParticipantId = (conversation: any, userId: string): string | null => {
  const other = (conversation.participants || []).find(
    (p: any) => String(p._id ?? p) !== userId,
  );
  if (!other) return null;
  return String(other._id ?? other);
};

// ─── Helper: Resolve MinIO keys to URLs in message ────
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

// ─── Types ─────────────────────────────────────────────
type TSendMessagePayload = {
  type: "text" | "image" | "video";
  content?: string;
  images?: string[];
  video?: string;
};

type TSendOfferPayload = {
  title: string;
  description?: string;
  price: number;
  priceType?: "fixed" | "hourly";
  date?: string;
  startTime?: string;
  endTime?: string;
  address?: string;
  longitude?: number;
  latitude?: number;
  paymentMethod?: "cash" | "online";
  images?: string[];
};

type TEditOfferPayload = {
  title?: string;
  description?: string;
  date?: string;
  price?: number;
  priceType?: "fixed" | "hourly";
  startTime?: string;
  endTime?: string;
  address?: string;
  longitude?: number;
  latitude?: number;
  paymentMethod?: "cash" | "online";
  images?: string[];
};

// ─── Helper: resolve participant avatar keys ───────────
const resolveParticipant = (p: any) => {
  if (!p || typeof p !== "object") return p;
  const obj = typeof p.toObject === "function" ? p.toObject() : { ...p };
  return {
    ...obj,
    _id: obj._id,
    name: obj.name,
    avatar: resolveUrl(obj.avatar) ?? null,
  };
};

// ─── List User's Conversations ─────────────────────────
const listConversations = async (userId: string) => {
  const uid = String(userId);
  const conversations = await ChatRepository.findUserConversations(uid);

  const enriched = conversations.map((conv) => {
    const participants = (conv.participants || []).map(resolveParticipant);
    const otherParticipant = participants.find(
      (p: any) => String(p._id) !== uid,
    );
    const unreadCount = conv.unreadCounts.get(uid) || 0;

    return {
      _id: conv._id,
      participants,
      otherParticipant: otherParticipant || null,
      lastMessage: conv.lastMessage || null,
      lastMessageAt: conv.lastMessageAt,
      unreadCount,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  });

  return enriched;
};

// ─── Create or Get Conversation ────────────────────────
const createOrGetConversation = async (
  userId: string,
  participantId: string,
) => {
  const uid = String(userId);
  const pid = String(participantId);

  if (uid === pid) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Cannot create conversation with yourself",
    );
  }

  const otherUser = await UserRepository.findById(pid, { populate: "auth" });
  if (!otherUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  if (otherUser.isBlocked || otherUser.isDeleted || (otherUser.auth as any)?.isBlacklisted) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Cannot start conversation with a suspended or blacklisted user",
    );
  }

  const conversation = await ChatRepository.createConversation([uid, pid]);

  // Build enriched response with otherParticipant
  const participants = (conversation.participants as any[])?.map(
    resolveParticipant,
  ) || [];
  const other = participants.find((p: any) => String(p._id) !== uid);

  return {
    _id: conversation._id,
    participants,
    otherParticipant: other || null,
    lastMessage: conversation.lastMessage || null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCounts?.get(uid) || 0,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};

// ─── Get Messages ──────────────────────────────────────
const getMessages = async (
  conversationId: string,
  userId: string,
  options: { page?: number; limit?: number; before?: string },
) => {
  const uid = String(userId);

  try {
    await ChatRepository.expireStuckAwaitingPayment(24);
  } catch (_) {}

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some(
    (p: any) => String(p._id) === uid,
  );
  if (!isParticipant) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a participant in this conversation",
    );
  }

  const result = await ChatRepository.findMessagesByConversation(
    conversationId,
    {
      page: options.page || 1,
      limit: options.limit || 20,
      before: options.before,
    },
  );

  const unreadMessages = await ChatRepository.findUnreadMessages(
    conversationId,
    uid,
  );
  if (unreadMessages.length > 0) {
    const ids = unreadMessages.map((m: any) => String(m._id));
    await ChatRepository.markMessagesRead(conversationId, uid, ids);
    await ChatRepository.markConversationRead(
      conversationId,
      uid,
      unreadMessages.length,
    );

    // Tell the peer we've seen their messages
    try {
      const { emitToConversation } = await import("../../socket/socket.gateway");
      emitToConversation(conversationId, "chat:read", {
        conversationId,
        userId: uid,
        messageIds: ids,
      });
    } catch (_) {}
  }

  return result;
};

// ─── Send Message ──────────────────────────────────────
const sendMessage = async (
  conversationId: string,
  senderId: string,
  payload: TSendMessagePayload,
) => {
  const sid = String(senderId);

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some(
    (p: any) => String(p._id) === sid,
  );
  if (!isParticipant) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a participant in this conversation",
    );
  }

  if (payload.type === "text" && !payload.content) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Text message requires content",
    );
  }
  if (payload.type === "image" && (!payload.images || payload.images.length === 0)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Image message requires at least one image",
    );
  }
  if (payload.type === "image" && payload.images && payload.images.length > 4) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Maximum 4 images per message",
    );
  }
  if (payload.type === "video" && !payload.video) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Video message requires a video",
    );
  }

  const message = await ChatRepository.createMessage({
    conversation: conversationId as any,
    sender: sid as any,
    type: payload.type as MessageType,
    content: payload.content,
    images: payload.images || [],
    video: payload.video,
    readBy: [{ userId: sid as any, readAt: new Date() }],
  });

  await ChatRepository.updateConversationLastMessage(
    conversationId,
    message._id,
    sid,
  );

  const populated = (
    await (message as any).populate("sender", "name avatar")
  ).toObject();

  const resolved = resolveMessageUrls(populated);

  // Push to the other participant (skip self)
  const otherId = getOtherParticipantId(conversation, sid);
  if (otherId) {
    const senderName = (resolved.sender as any)?.name || "Someone";
    let body: string;
    if (payload.type === "text") {
      body = payload.content || "New message";
    } else if (payload.type === "image") {
      body = "Sent a photo";
    } else {
      body = "Sent a video";
    }
    if (body.length > 80) body = `${body.slice(0, 80)}…`;

    notifyUser(otherId, senderName, body, {
      type: "chat_message",
      conversationId: String(conversationId),
      messageId: String(message._id),
      senderId: sid,
    }).catch(() => {});
  }

  return resolved;
};

// ─── Send Offer ────────────────────────────────────────
const sendOffer = async (
  conversationId: string,
  senderId: string,
  payload: TSendOfferPayload,
) => {
  const sid = String(senderId);

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some(
    (p: any) => String(p._id) === sid,
  );
  if (!isParticipant) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a participant in this conversation",
    );
  }

  const message = await ChatRepository.createMessage({
    conversation: conversationId as any,
    sender: sid as any,
    type: MessageType.OFFER,
    offerData: {
      title: payload.title,
      description: payload.description || "",
      price: payload.price,
      priceType: (payload.priceType as PriceType) || PriceType.FIXED,
      date: payload.date || "",
      startTime: payload.startTime || "",
      endTime: payload.endTime || "",
      address: payload.address || "",
      location:
        payload.longitude != null && payload.latitude != null
          ? {
              type: "Point",
              coordinates: [payload.longitude, payload.latitude],
            }
          : undefined,
      paymentMethod:
        (payload.paymentMethod as PaymentMethod) || PaymentMethod.CASH,
      images: payload.images || [],
      status: OfferStatus.PENDING,
    },
    readBy: [{ userId: sid as any, readAt: new Date() }],
  });

  await ChatRepository.updateConversationLastMessage(
    conversationId,
    message._id,
    sid,
  );

  const populated = (
    await (message as any).populate("sender", "name avatar")
  ).toObject();

  const resolved = resolveMessageUrls(populated);

  const otherId = getOtherParticipantId(conversation, sid);
  if (otherId) {
    const senderName = (resolved.sender as any)?.name || "Someone";
    notifyUser(
      otherId,
      "New offer",
      `${senderName} sent an offer: ${payload.title} (${payload.price} MAD)`,
      {
        type: "chat_offer",
        conversationId: String(conversationId),
        messageId: String(message._id),
        senderId: sid,
      },
    ).catch(() => {});
  }

  return resolved;
};

// ─── Accept Offer ──────────────────────────────────────
/**
 * Emit offer status change to conversation room + peer user room.
 * Shared by accept / reject / cancel / edit so live UI stays in sync.
 */
const emitOfferUpdated = async (
  conversationId: string,
  actorId: string,
  message: any,
) => {
  try {
    const { emitToConversation, emitToUser } = await import(
      "../../socket/socket.gateway"
    );
    const payload = {
      conversationId: String(conversationId),
      messageId: String(message._id),
      offerId: String(message._id),
      offerData: message.offerData,
      message,
    };
    emitToConversation(conversationId, "chat:offer-update", payload);
    emitToConversation(conversationId, "chat:receive", message);

    const conversation = await ChatRepository.findConversationById(conversationId);
    const other = (conversation?.participants || []).find(
      (p: any) => String(p._id ?? p) !== String(actorId),
    );
    if (other) {
      const otherId = String(other._id ?? other);
      emitToUser(otherId, "chat:offer-update", payload);
      emitToUser(otherId, "chat:conversation_updated", {
        conversationId: String(conversationId),
        lastMessage: message,
      });
    }
  } catch (_) {
    // Realtime emit is best-effort; DB state is already committed.
  }
};

// ─── Accept Offer ──────────────────────────────────────
const acceptOffer = async (
  conversationId: string,
  userId: string,
  offerMessageId: string,
) => {
  const uid = String(userId);

  // Unstick abandoned online checkouts so the offer can be retried
  try {
    await ChatRepository.expireStuckAwaitingPayment(24);
  } catch (_) {}

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some(
    (p: any) => String(p._id) === uid,
  );
  if (!isParticipant) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a participant in this conversation",
    );
  }

  const message = await ChatRepository.findMessageById(offerMessageId);
  if (!message) {
    throw new AppError(StatusCodes.NOT_FOUND, "Offer message not found");
  }

  if (String(message.conversation) !== conversationId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Message does not belong to this conversation",
    );
  }

  if (message.type !== MessageType.OFFER || !message.offerData) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Message is not an offer");
  }

  const isOnline = message.offerData.paymentMethod === PaymentMethod.ONLINE;
  const isAcceptable = isOnline
    ? message.offerData.status === OfferStatus.PENDING ||
      message.offerData.status === OfferStatus.AWAITING_PAYMENT
    : message.offerData.status === OfferStatus.PENDING;

  if (!isAcceptable) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This offer is no longer pending",
    );
  }

  if (String(message.sender) === uid) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You cannot accept your own offer",
    );
  }

  const offer = message.offerData;

  if (offer.paymentMethod === PaymentMethod.ONLINE) {
    // Allow retry: PENDING first accept, or AWAITING_PAYMENT if user backed out of checkout
    const canStartPayment =
      message.offerData.status === OfferStatus.PENDING ||
      message.offerData.status === OfferStatus.AWAITING_PAYMENT;
    if (!canStartPayment) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "This offer is no longer pending",
      );
    }

    if (message.offerData.status === OfferStatus.PENDING) {
      const claimedOnline = await ChatRepository.claimOfferStatus(
        offerMessageId,
        OfferStatus.AWAITING_PAYMENT,
        [OfferStatus.PENDING],
      );
      if (!claimedOnline) {
        throw new AppError(
          StatusCodes.BAD_REQUEST,
          "This offer is no longer pending",
        );
      }
    }

    try {
      const isHourly = (offer.priceType || "fixed") === "hourly";
      const amount = isHourly
        ? calcHourlyTotalMAD(
            Number(offer.price) || 0,
            offer.startTime,
            offer.endTime,
          )
        : Math.round(Number(offer.price) || 0);

      const { PaymentService } = await import("../payment/payment.service");
      const paymentSession = await PaymentService.initializePayment(uid, {
        amount,
        orderId: offerMessageId,
        orderType: "offer",
        metadata: {
          userId: uid,
          helperId: String(message.sender),
          conversationId,
          offerMessageId,
        },
      });

      return {
        status: "pending_payment",
        paymentRequired: true,
        amount,
        checkoutUrl: paymentSession.checkoutUrl,
        sessionId: paymentSession.sessionId,
      };
    } catch (err) {
      // Rollback claim only if we just moved PENDING → AWAITING
      if (message.offerData.status === OfferStatus.PENDING) {
        await ChatRepository.claimOfferStatus(
          offerMessageId,
          OfferStatus.PENDING,
          [OfferStatus.AWAITING_PAYMENT],
        );
      }
      throw err;
    }
  }

  // Cash — claim offer atomically, then create job
  const claimed = await ChatRepository.updateOfferStatusIfPending(
    offerMessageId,
    OfferStatus.ACCEPTED,
  );
  if (!claimed) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This offer is no longer pending",
    );
  }

  let job: any;
  try {
    job = await createJobFromOffer(offer, String(message.sender), uid, offerMessageId);
  } catch (err) {
    // Rollback claim so offer is not stuck ACCEPTED without a job
    await ChatRepository.updateOfferStatus(
      offerMessageId,
      OfferStatus.PENDING,
    );
    throw err;
  }

  const acceptedMessage = await ChatRepository.updateOfferStatus(
    offerMessageId,
    OfferStatus.ACCEPTED,
    String(job._id),
  );

  if (acceptedMessage) {
    await emitOfferUpdated(conversationId, uid, acceptedMessage);
  }

  notifyUser(
    String(message.sender),
    "Offer accepted",
    `Your offer "${offer.title}" was accepted. A job was created.`,
    {
      type: "offer_accepted",
      conversationId: String(conversationId),
      offerMessageId: String(offerMessageId),
      jobId: String(job._id),
    },
  ).catch(() => {});

  return { status: "accepted", jobId: job._id, paymentRequired: false };
};

// ─── Reject Offer ──────────────────────────────────────
const rejectOffer = async (
  conversationId: string,
  userId: string,
  offerMessageId: string,
) => {
  const uid = String(userId);

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some(
    (p: any) => String(p._id) === uid,
  );
  if (!isParticipant) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a participant in this conversation",
    );
  }

  const message = await ChatRepository.findMessageById(offerMessageId);
  if (!message) {
    throw new AppError(StatusCodes.NOT_FOUND, "Offer message not found");
  }

  if (String(message.conversation) !== conversationId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Message does not belong to this conversation",
    );
  }

  if (message.type !== MessageType.OFFER || !message.offerData) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Message is not an offer");
  }

  if (
    message.offerData.status !== OfferStatus.PENDING &&
    message.offerData.status !== OfferStatus.AWAITING_PAYMENT
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This offer is no longer pending",
    );
  }

  if (String(message.sender) === uid) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You cannot reject your own offer",
    );
  }

  const rejected = await ChatRepository.claimOfferStatus(
    offerMessageId,
    OfferStatus.REJECTED,
    [OfferStatus.PENDING, OfferStatus.AWAITING_PAYMENT],
  );
  if (!rejected) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This offer is no longer pending",
    );
  }

  await emitOfferUpdated(conversationId, uid, rejected);

  notifyUser(
    String(message.sender),
    "Offer rejected",
    `Your offer "${message.offerData?.title || "offer"}" was rejected.`,
    {
      type: "offer_rejected",
      conversationId: String(conversationId),
      offerMessageId: String(offerMessageId),
    },
  ).catch(() => {});

  return { status: "rejected" };
};

// ─── Cancel Offer (Helper only, before acceptance) ─────
const cancelOffer = async (
  conversationId: string,
  userId: string,
  offerMessageId: string,
) => {
  const uid = String(userId);

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some(
    (p: any) => String(p._id) === uid,
  );
  if (!isParticipant) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a participant in this conversation",
    );
  }

  const message = await ChatRepository.findMessageById(offerMessageId);
  if (!message) {
    throw new AppError(StatusCodes.NOT_FOUND, "Offer message not found");
  }

  if (String(message.conversation) !== conversationId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Message does not belong to this conversation",
    );
  }

  if (message.type !== MessageType.OFFER || !message.offerData) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Message is not an offer");
  }

  if (
    message.offerData.status !== OfferStatus.PENDING &&
    message.offerData.status !== OfferStatus.AWAITING_PAYMENT
  ) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This offer is no longer pending",
    );
  }

  if (String(message.sender) !== uid) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Only the offer sender can cancel",
    );
  }

  const cancelled = await ChatRepository.claimOfferStatus(
    offerMessageId,
    OfferStatus.CANCELLED,
    [OfferStatus.PENDING, OfferStatus.AWAITING_PAYMENT],
  );
  if (!cancelled) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This offer is no longer pending",
    );
  }

  await emitOfferUpdated(conversationId, uid, cancelled);

  // Notify the other participant (the client who would have accepted)
  const otherId = getOtherParticipantId(conversation, uid);
  if (otherId) {
    notifyUser(
      otherId,
      "Offer cancelled",
      `An offer "${message.offerData?.title || "offer"}" was cancelled by the helper.`,
      {
        type: "offer_cancelled",
        conversationId: String(conversationId),
        offerMessageId: String(offerMessageId),
      },
    ).catch(() => {});
  }

  return { status: "cancelled" };
};

// ─── Edit Offer (Helper only, before acceptance) ───────
const editOffer = async (
  conversationId: string,
  userId: string,
  offerMessageId: string,
  payload: TEditOfferPayload,
) => {
  const uid = String(userId);

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }

  const isParticipant = conversation.participants.some(
    (p: any) => String(p._id) === uid,
  );
  if (!isParticipant) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a participant in this conversation",
    );
  }

  const message = await ChatRepository.findMessageById(offerMessageId);
  if (!message) {
    throw new AppError(StatusCodes.NOT_FOUND, "Offer message not found");
  }

  if (String(message.conversation) !== conversationId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Message does not belong to this conversation",
    );
  }

  if (message.type !== MessageType.OFFER || !message.offerData) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Message is not an offer");
  }

  if (message.offerData.status !== OfferStatus.PENDING) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "This offer is no longer pending",
    );
  }

  if (String(message.sender) !== uid) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Only the offer sender can edit",
    );
  }

  const update: any = { ...payload };
  if (payload.longitude != null && payload.latitude != null) {
    update.location = {
      type: "Point",
      coordinates: [payload.longitude, payload.latitude],
    };
  }
  delete update.longitude;
  delete update.latitude;

  const updated = await ChatRepository.updateOfferData(offerMessageId, update);
  if (updated) {
    await emitOfferUpdated(conversationId, uid, updated);
    const otherId = getOtherParticipantId(conversation, uid);
    if (otherId) {
      notifyUser(
        otherId,
        "Offer updated",
        `An offer was updated: ${updated.offerData?.title || "offer"} (${updated.offerData?.price ?? ""} MAD)`,
        {
          type: "chat_offer",
          conversationId: String(conversationId),
          messageId: String(offerMessageId),
          senderId: uid,
        },
      ).catch(() => {});
    }
  }
  return updated;
};

// ─── Mark Messages Read ────────────────────────────────
const markRead = async (
  conversationId: string,
  userId: string,
  messageIds: string[],
) => {
  const uid = String(userId);

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }
  const isParticipant = conversation.participants.some(
    (p: any) => String(p._id ?? p) === uid,
  );
  if (!isParticipant) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a participant in this conversation",
    );
  }

  await ChatRepository.markMessagesRead(conversationId, uid, messageIds);
  await ChatRepository.markConversationRead(conversationId, uid);
  return { success: true };
};

// ─── Helper: Create Job from Offer ─────────────────────
const createJobFromOffer = async (
  offer: any,
  helperId: string,
  clientId: string,
  offerMessageId?: string,
) => {
  const client = await UserRepository.findById(clientId);
  const helper = await UserRepository.findById(helperId);

  // Require helper service type so offer jobs land in the correct category
  const categoryId = helper?.serviceType;
  if (!categoryId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Helper must set a service type before accepting offers. Update your profile first.",
    );
  }

  // Hourly offers: charge rate × duration, rounded to whole MAD.
  // Fixed offers: charge offer.price as total.
  const isHourly = (offer.priceType || "fixed") === "hourly";
  const hoursBilled = isHourly
    ? parseHoursBetween(offer.startTime, offer.endTime)
    : null;
  const totalBudget = isHourly
    ? calcHourlyTotalMAD(Number(offer.price) || 0, offer.startTime, offer.endTime)
    : Math.round(Number(offer.price) || 0);

  // Calculate dynamic platform commission from settings
  let feePct = 20;
  try {
    const { SettingsService } = await import("../settings/settings.service");
    const settings = await SettingsService.getSettings();
    if (settings?.platformFeePercentage != null) {
      feePct = settings.platformFeePercentage;
    }
  } catch (_) {}

  let commission = 0;
  if (offer.paymentMethod === "cash") {
    commission = Math.round(totalBudget * (feePct / 100));
    const { WalletRepository } = await import("module/wallet/wallet.repository");
    try {
      await WalletRepository.deductCommission(
        helperId,
        commission,
        offerMessageId ? `offer_${offerMessageId}` : `offer_${Date.now()}`,
      );
    } catch (err: any) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        err.message || `Failed to deduct ${feePct}% platform commission. Insufficient wallet balance.`
      );
    }
  }

  const jobData: any = {
    title: offer.title,
    description: offer.description || "",
    date: offer.date ? new Date(offer.date) : undefined,
    budget: totalBudget,
    budgetType: offer.priceType || "fixed",
    paymentMethod: offer.paymentMethod || "cash",
    paymentStatus: offer.paymentMethod === "online" ? "paid" : "pending",
    status: JobStatus.IN_PROGRESS,
    postedBy: clientId,
    assignedTo: helperId,
    images: offer.images || [],
    startTime: offer.startTime || "",
    endTime: offer.endTime || "",
    commissionDeducted: commission,
    isCustomOffer: true,
  };

  if (isHourly) {
    jobData.description = [
      offer.description || "",
      `Hourly rate: ${Math.round(Number(offer.price) || 0)} MAD/h` +
        (hoursBilled ? ` × ${Math.round(hoursBilled * 100) / 100}h = ${totalBudget} MAD` : ""),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (categoryId) {
    jobData.category = categoryId;
  }

  // Prefer offer work location (same shape as client post-job).
  if (offer.address) {
    jobData.address = offer.address;
  } else if (client?.address) {
    jobData.address = client.address;
  }

  const offerCoords = (offer as any).location?.coordinates;
  if (Array.isArray(offerCoords) && offerCoords.length >= 2) {
    jobData.location = {
      type: "Point",
      coordinates: [Number(offerCoords[0]), Number(offerCoords[1])],
    };
  } else if (client?.location?.coordinates) {
    jobData.location = {
      type: "Point",
      coordinates: client.location.coordinates,
    };
  }

  let job: any;
  try {
    job = await JobRepository.create(jobData);
  } catch (err) {
    // Compensate: return commission if job row could not be created
    if (commission > 0) {
      try {
        const { WalletRepository } = await import("module/wallet/wallet.repository");
        await WalletRepository.refundCommission(
          helperId,
          commission,
          offerMessageId ? `offer_${offerMessageId}` : `offer_${Date.now()}`,
        );
      } catch (_) {}
    }
    throw err;
  }

  JobRepository.appendHistory(job._id, {
    action: "accepted",
    by: helperId,
    byRole: "helper",
    note: offerMessageId
      ? `Custom offer${commission > 0 ? ` · commission ${commission} MAD` : ""}`
      : undefined,
  }).catch(() => {});

  return job;
};

export const ChatService = {
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
  createJobFromOffer,
};
