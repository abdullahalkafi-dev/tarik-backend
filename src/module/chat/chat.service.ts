import { Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { ChatRepository } from "./chat.repository";
import { Message } from "./message.model";
import { Conversation } from "./conversation.model";
import { JobRepository } from "module/job/job.repository";
import { Job } from "module/job/job.model";
import { UserRepository } from "module/user/user.repository";
import { SettingsService } from "../settings/settings.service";
import { CategoryService } from "../category/category.service";
import { WalletRepository } from "../wallet/wallet.repository";
import { resolveUrl } from "../../util/minio";
import { notifyUser, notifyUserT, textFor } from "../../util/notifyUser";
import { commissionFor, computePricing, helperNetFor } from "../../util/pricing";
import { buildSchedule } from "../../util/schedule";
import { maskContactInfo } from "../../util/contactMask";
import { assertOwnUploadKeys } from "../../util/uploadKey";
import redisClient from "../../redis/redisClient";
import { SocketPresenceService } from "../../socket/socket.presence";
import { logger } from "../../logger/logger";
import { MessageType, OfferStatus, PriceType, PaymentMethod } from "./chat.interface";
import { ACTIVE_JOB_STATUSES, JobStatus } from "module/job/job.interface";
import { assertHelperFreeForSlot, assertScheduleNotPast, dayToDate } from "module/job/job.service";

const OFFER_TTL_HOURS = 48;
const MAX_OPEN_OFFERS_PER_HELPER = 5;
const MESSAGES_PER_MINUTE = 30;
const NEW_CONVERSATIONS_PER_DAY = 30;
const PAYMENT_LOCK_MINUTES = 30;
const STAFF_ROLES = ["admin", "staff", "superAdmin"];

// ─── Small helpers ─────────────────────────────────────
const idOf = (v: any): string => String(v?._id ?? v ?? "");

const getOtherParticipantId = (conversation: any, userId: string): string | null => {
  const other = (conversation.participants || []).find((p: any) => idOf(p) !== String(userId));
  return other ? idOf(other) : null;
};

const assertParticipant = (conversation: any, userId: string) => {
  const isParticipant = (conversation.participants || []).some((p: any) => idOf(p) === String(userId));
  if (!isParticipant) {
    throw new AppError(StatusCodes.FORBIDDEN, "You are not a participant in this conversation");
  }
};

const assertNotBlocked = (conversation: any) => {
  if ((conversation.blockedBy || []).length > 0) {
    throw new AppError(StatusCodes.FORBIDDEN, "This conversation is blocked", {
      code: "CONVERSATION_BLOCKED",
    });
  }
};

/** At most N events per minute / day per user (shared by REST and socket paths). Fails open without Redis. */
const rateGate = async (key: string, windowSeconds: number, max: number, code: string) => {
  if (!redisClient.isAvailable()) return;
  try {
    const n = await redisClient.incrWithWindow(key, windowSeconds);
    if (n > max) {
      throw new AppError(StatusCodes.TOO_MANY_REQUESTS, "You are doing this too fast. Please slow down.", { code });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
  }
};

const hasJobBetween = async (a: string, b: string): Promise<boolean> =>
  Boolean(
    await Job.exists({
      $or: [
        { postedBy: a, assignedTo: b },
        { postedBy: b, assignedTo: a },
      ],
      status: { $in: [...ACTIVE_JOB_STATUSES, JobStatus.COMPLETED] },
    }),
  );

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
  date: string;
  startTime?: string;
  endTime?: string;
  address: string;
  longitude: number;
  latitude: number;
  paymentMethod?: "cash" | "online";
  images?: string[];
};

type TEditOfferPayload = Partial<TSendOfferPayload>;

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
const listConversations = async (
  userId: string,
  options: { limit?: number; before?: string } = {},
) => {
  const uid = String(userId);
  const conversations = await ChatRepository.findUserConversations(uid, options);

  const others = conversations
    .map((c) => getOtherParticipantId(c, uid))
    .filter((id): id is string => Boolean(id));
  const online = await SocketPresenceService.onlineMap(others).catch(() => ({}) as Record<string, boolean>);

  return conversations.map((conv) => {
    const participants = (conv.participants || []).map(resolveParticipant);
    const otherParticipant = participants.find((p: any) => String(p._id) !== uid) || null;
    const unreadCount = conv.unreadCounts.get(uid) || 0;
    const otherId = otherParticipant ? String(otherParticipant._id) : "";

    return {
      _id: conv._id,
      participants,
      otherParticipant: otherParticipant
        ? { ...otherParticipant, isOnline: Boolean(online[otherId]) }
        : null,
      isOnline: Boolean(online[otherId]),
      isBlocked: (conv.blockedBy || []).length > 0,
      lastMessage: conv.lastMessage || null,
      lastMessageAt: conv.lastMessageAt,
      unreadCount,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  });
};

/** Online flags for people the caller actually shares a conversation with. */
const getPresence = async (userId: string, ids: string[]) => {
  const uid = String(userId);
  const convs = await Conversation.find({ participants: uid }).select("participants").limit(1000).lean();
  const partners = new Set<string>();
  for (const c of convs) for (const p of c.participants || []) partners.add(String(p));
  const allowed = ids.filter((id) => partners.has(id) && id !== uid);
  return SocketPresenceService.onlineMap(allowed);
};

const getUnreadTotal = async (userId: string) => ({
  unread: await ChatRepository.totalUnread(String(userId)),
});

// ─── Create or Get Conversation ────────────────────────
const createOrGetConversation = async (userId: string, participantId: string) => {
  const uid = String(userId);
  const pid = String(participantId);

  if (uid === pid) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Cannot create conversation with yourself");
  }

  const [me, otherUser] = await Promise.all([
    UserRepository.findById(uid, { populate: "auth" }),
    UserRepository.findById(pid, { populate: "auth" }),
  ]);
  if (!me || !otherUser) {
    throw new AppError(StatusCodes.NOT_FOUND, "User not found");
  }

  if (otherUser.isBlocked || otherUser.isDeleted || (otherUser.auth as any)?.isBlacklisted) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Cannot start conversation with a suspended or blacklisted user",
    );
  }

  const existing = await Conversation.exists({
    participants: { $all: [new Types.ObjectId(uid), new Types.ObjectId(pid)], $size: 2 },
  });

  if (!existing) {
    // New conversations only between a client and an approved helper that are
    // related: the client looks at a helper's profile, or the helper answers a
    // client who posted a job. No client↔client, helper↔helper or random contact.
    const myRole = (me.auth as any)?.role;
    const otherRole = (otherUser.auth as any)?.role;
    const iAmApprovedHelper = me.helperApplicationStatus === "approved";
    const otherIsApprovedHelper = otherUser.helperApplicationStatus === "approved";

    let allowed = false;
    if (STAFF_ROLES.includes(myRole) || STAFF_ROLES.includes(otherRole)) {
      allowed = false;
    } else if (!iAmApprovedHelper && otherIsApprovedHelper) {
      allowed = true; // client → helper
    } else if (iAmApprovedHelper && !otherIsApprovedHelper && otherRole === "user") {
      allowed = Boolean(await Job.exists({ postedBy: pid })); // helper → client who posted a job
    }

    if (!allowed) {
      throw new AppError(StatusCodes.FORBIDDEN, "You cannot start a conversation with this user", {
        code: "CHAT_NOT_ALLOWED",
      });
    }
    await rateGate(`rl:newconv:${uid}`, 24 * 3600, NEW_CONVERSATIONS_PER_DAY, "TOO_MANY_CONVERSATIONS");
  }

  const conversation = await ChatRepository.createConversation([uid, pid]);

  const participants = (conversation.participants as any[])?.map(resolveParticipant) || [];
  const other = participants.find((p: any) => String(p._id) !== uid);
  const isOnline = await SocketPresenceService.isUserOnline(pid).catch(() => false);

  return {
    _id: conversation._id,
    participants,
    otherParticipant: other ? { ...other, isOnline } : null,
    isOnline,
    isBlocked: ((conversation as any).blockedBy || []).length > 0,
    lastMessage: conversation.lastMessage || null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCounts?.get(uid) || 0,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
};

// ─── Block / report ────────────────────────────────────
const setBlocked = async (conversationId: string, userId: string, blocked: boolean) => {
  const uid = String(userId);
  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  assertParticipant(conversation, uid);
  await ChatRepository.setBlocked(conversationId, uid, blocked);
  return { blocked };
};

const reportConversation = async (
  conversationId: string,
  userId: string,
  payload: { reason: string; message?: string },
) => {
  const uid = String(userId);
  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  assertParticipant(conversation, uid);
  const otherId = getOtherParticipantId(conversation, uid);

  const { SupportService } = await import("../support/support.service");
  const ticket = await SupportService.createTicket(uid, {
    subject: `Chat report: ${payload.reason}`,
    message: payload.message?.trim() || `Reported conversation ${conversationId} (${payload.reason})`,
    category: "safety",
    reportedUserId: otherId || undefined,
  });
  return { ticketId: ticket._id };
};

// ─── Get Messages ──────────────────────────────────────
const getMessages = async (
  conversationId: string,
  userId: string,
  options: { page?: number; limit?: number; before?: string },
) => {
  const uid = String(userId);

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }
  assertParticipant(conversation, uid);

  const result = await ChatRepository.findMessagesByConversation(conversationId, {
    page: options.page || 1,
    limit: options.limit || 20,
    before: options.before,
  });

  // Only the messages that were actually delivered in this page become "read"
  // (older unread ones stay unread), and the badge shows the true remainder.
  const unreadIds = result.docs
    .filter(
      (m: any) =>
        idOf(m.sender) !== uid && !(m.readBy || []).some((r: any) => idOf(r.userId) === uid),
    )
    .map((m: any) => String(m._id));

  if (unreadIds.length > 0) {
    await ChatRepository.markMessagesRead(conversationId, uid, unreadIds);
    const remaining = await ChatRepository.countUnread(conversationId, uid);
    await ChatRepository.setUnreadCount(conversationId, uid, remaining);

    try {
      const { emitToConversation } = await import("../../socket/socket.gateway");
      emitToConversation(conversationId, "chat:read", {
        conversationId,
        userId: uid,
        messageIds: unreadIds,
      });
    } catch (_) {
      // best effort
    }
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

  await rateGate(`rl:msg:${sid}`, 60, MESSAGES_PER_MINUTE, "MESSAGE_RATE_LIMIT");

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }
  assertParticipant(conversation, sid);
  assertNotBlocked(conversation);

  const otherId = getOtherParticipantId(conversation, sid);
  if (otherId) {
    const other = await UserRepository.findById(otherId, { select: "isBlocked isDeleted locale" });
    if (!other || other.isBlocked || other.isDeleted) {
      throw new AppError(StatusCodes.FORBIDDEN, "This user is no longer available", {
        code: "USER_UNAVAILABLE",
      });
    }
  }

  if (payload.type === "text" && !payload.content) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Text message requires content");
  }
  if (payload.type === "image" && (!payload.images || payload.images.length === 0)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Image message requires at least one image");
  }
  if (payload.type === "image" && payload.images && payload.images.length > 4) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Maximum 4 images per message");
  }
  if (payload.type === "video" && !payload.video) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Video message requires a video");
  }

  // Files must be the sender's own uploads.
  const images = payload.type === "image" ? assertOwnUploadKeys(payload.images, sid, { kinds: ["images"] }) : [];
  const video = payload.type === "video" && payload.video
    ? assertOwnUploadKeys([payload.video], sid, { kinds: ["videos"] })[0]
    : undefined;

  // Until a job links the two people, contact details are hidden.
  let content = payload.content;
  let masked = false;
  if (payload.type === "text" && content && otherId && !(await hasJobBetween(sid, otherId))) {
    const m = maskContactInfo(content);
    content = m.text;
    masked = m.masked;
  }

  const message = await ChatRepository.createMessage({
    conversation: conversationId as any,
    sender: sid as any,
    type: payload.type as MessageType,
    content,
    images,
    video,
    masked,
    readBy: [{ userId: sid as any, readAt: new Date() }],
  });

  await ChatRepository.updateConversationLastMessage(conversationId, message._id, sid);

  const populated = (await (message as any).populate("sender", "name avatar")).toObject();
  const resolved = resolveMessageUrls(populated);

  // Push to the other participant (skipped while they are looking at this very chat).
  if (otherId) {
    const recipient = await UserRepository.findById(otherId, { select: "locale" });
    const senderName = (resolved.sender as any)?.name || textFor("chat.someone", recipient?.locale).body;
    let body: string;
    if (payload.type === "text") {
      body = content || "…";
    } else if (payload.type === "image") {
      body = textFor("chat.photo", recipient?.locale).body;
    } else {
      body = textFor("chat.video", recipient?.locale).body;
    }
    if (body.length > 80) body = `${body.slice(0, 80)}…`;

    notifyUser(
      otherId,
      senderName,
      body,
      {
        type: "chat_message",
        conversationId: String(conversationId),
        messageId: String(message._id),
        senderId: sid,
      },
      { skipPushIfInConversation: String(conversationId) },
    ).catch(() => undefined);
  }

  return resolved;
};

// ─── Offers ────────────────────────────────────────────
/** Amounts of an offer, computed on the server with the same rules as a normal job. */
const buildOfferFinancials = async (input: {
  priceType: "fixed" | "hourly";
  price: number;
  startTime?: string | null;
  endTime?: string | null;
  paymentMethod: PaymentMethod;
  helperCategory: unknown;
}) => {
  const pricing = computePricing({
    priceType: input.priceType,
    amount: input.price,
    startTime: input.startTime,
    endTime: input.endTime,
  });

  const settings = await SettingsService.getSettings();
  const minAmount = Number(settings?.minimumServiceAmount) || 0;
  if (minAmount > 0 && pricing.total < minAmount) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Minimum job budget is ${minAmount} MAD`, {
      code: "MIN_BUDGET",
      params: { min: minAmount },
    });
  }
  if (input.priceType === "hourly") {
    await CategoryService.assertMinHourlyRate(input.helperCategory, input.price);
  }

  const feePct = await SettingsService.getFeePercentage();
  const commission = input.paymentMethod === PaymentMethod.CASH ? commissionFor(pricing.total, feePct) : 0;
  return {
    ...pricing,
    feePercentage: feePct,
    commission,
    helperNet: helperNetFor(pricing.total, feePct),
  };
};

const assertApprovedHelper = (user: any) => {
  if (
    !user ||
    user.helperApplicationStatus !== "approved" ||
    user.isBlocked ||
    user.isDeleted ||
    (user.auth as any)?.isBlacklisted
  ) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only approved helpers can send offers", {
      code: "NOT_APPROVED",
    });
  }
  if (!user.serviceType) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Helper must set a service type before sending offers. Update your profile first.",
      { code: "NO_SERVICE_TYPE" },
    );
  }
};

const offerExpiry = () => new Date(Date.now() + OFFER_TTL_HOURS * 3_600_000);

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
  assertParticipant(conversation, sid);
  assertNotBlocked(conversation);

  const senderUser = await UserRepository.findById(sid, { populate: "auth" });
  assertApprovedHelper(senderUser);

  // The offer must go to a client, never to another helper.
  const receiverId = getOtherParticipantId(conversation, sid);
  const receiver = receiverId ? await UserRepository.findById(receiverId, { populate: "auth" }) : null;
  if (!receiver || receiver.isBlocked || receiver.isDeleted || (receiver.auth as any)?.role !== "user") {
    throw new AppError(StatusCodes.FORBIDDEN, "Offers can only be sent to clients", {
      code: "RECEIVER_NOT_CLIENT",
    });
  }

  // Too many open offers lock too much of the helper's balance.
  if ((await ChatRepository.countOpenOffersBySender(sid)) >= MAX_OPEN_OFFERS_PER_HELPER) {
    throw new AppError(StatusCodes.CONFLICT, "You have too many open offers. Wait for answers or cancel some.", {
      code: "TOO_MANY_OPEN_OFFERS",
      params: { max: MAX_OPEN_OFFERS_PER_HELPER },
    });
  }

  const paymentMethod = (payload.paymentMethod as PaymentMethod) || PaymentMethod.CASH;
  const priceType = (payload.priceType || "fixed") as "fixed" | "hourly";

  const fin = await buildOfferFinancials({
    priceType,
    price: payload.price,
    startTime: payload.startTime,
    endTime: payload.endTime,
    paymentMethod,
    helperCategory: senderUser!.serviceType,
  });

  const schedule = buildSchedule(payload.date, payload.startTime, payload.endTime);
  assertScheduleNotPast(payload.date, schedule);

  const images = assertOwnUploadKeys(payload.images, sid, { kinds: ["images"] });

  const offerMessageId = new Types.ObjectId();

  if (paymentMethod === PaymentMethod.CASH && fin.commission > 0) {
    // The commission is held from the helper's balance until the offer is answered or expires.
    await WalletRepository.deductCommission(sid, fin.commission, `offer_${offerMessageId}`);
  }

  let message: any;
  try {
    message = await ChatRepository.createMessage({
      _id: offerMessageId,
      conversation: conversationId as any,
      sender: sid as any,
      type: MessageType.OFFER,
      offerData: {
        title: payload.title,
        description: payload.description || "",
        price: payload.price,
        priceType: priceType as PriceType,
        date: payload.date,
        startTime: payload.startTime || "",
        endTime: payload.endTime || "",
        address: payload.address,
        location: { type: "Point", coordinates: [payload.longitude, payload.latitude] },
        paymentMethod,
        images,
        status: OfferStatus.PENDING,
        commissionDeducted: fin.commission,
        version: 1,
        totalAmount: fin.total,
        hourlyRate: fin.hourlyRate,
        hours: fin.hours,
        feePercentage: fin.feePercentage,
        helperNet: fin.helperNet,
        expiresAt: offerExpiry(),
      },
      readBy: [{ userId: sid as any, readAt: new Date() }],
    });
  } catch (err) {
    if (paymentMethod === PaymentMethod.CASH && fin.commission > 0) {
      await WalletRepository.refundCommission(sid, fin.commission, `offer_${offerMessageId}`).catch(() => undefined);
    }
    throw err;
  }

  await ChatRepository.updateConversationLastMessage(conversationId, message._id, sid);

  const populated = (await (message as any).populate("sender", "name avatar")).toObject();
  const resolved = resolveMessageUrls(populated);

  if (receiverId) {
    notifyUserT(
      receiverId,
      "offer.new",
      {
        name: (resolved.sender as any)?.name || "",
        title: payload.title,
        price: fin.total,
      },
      {
        type: "chat_offer",
        conversationId: String(conversationId),
        messageId: String(message._id),
        senderId: sid,
      },
      { skipPushIfInConversation: String(conversationId) },
    ).catch(() => undefined);
  }

  return resolved;
};

/**
 * Emit an offer status change to the conversation room + the peer's user room.
 * Offers use their own event (`chat:offer-update`) — they are not re-sent as new
 * chat messages, which used to draw duplicate bubbles on apps that do not de-duplicate.
 */
const emitOfferUpdated = async (conversationId: string, actorId: string, message: any) => {
  try {
    const { emitToConversation, emitToUser } = await import("../../socket/socket.gateway");
    const payload = {
      conversationId: String(conversationId),
      messageId: String(message._id),
      offerId: String(message._id),
      offerData: message.offerData,
      message,
    };
    emitToConversation(conversationId, "chat:offer-update", payload);

    const conversation = await ChatRepository.findConversationById(conversationId);
    const otherId = conversation ? getOtherParticipantId(conversation, String(actorId)) : null;
    if (otherId) {
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

/** A payment session that is still open for this offer (the client may be paying right now). */
const hasLivePayment = async (offerId: string): Promise<boolean> => {
  try {
    const { PaymentTransaction } = await import("../payment/payment.model");
    return Boolean(
      await PaymentTransaction.exists({
        orderId: offerId,
        status: "pending",
        createdAt: { $gte: new Date(Date.now() - PAYMENT_LOCK_MINUTES * 60_000) },
      } as any),
    );
  } catch {
    return false;
  }
};

const loadOffer = async (conversationId: string, userId: string, offerMessageId: string) => {
  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }
  assertParticipant(conversation, userId);

  const message = await ChatRepository.findMessageById(offerMessageId);
  if (!message) {
    throw new AppError(StatusCodes.NOT_FOUND, "Offer message not found");
  }
  if (String(message.conversation) !== conversationId) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Message does not belong to this conversation");
  }
  if (message.type !== MessageType.OFFER || !message.offerData) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Message is not an offer");
  }
  return { conversation, message };
};

/** Give the helper's held commission back (once — the ledger is idempotent per reference). */
const releaseOfferCommission = async (message: any) => {
  const amount = Number(message.offerData?.commissionDeducted) || 0;
  if (amount <= 0) return;
  try {
    await WalletRepository.refundCommission(String(message.sender), amount, `offer_${message._id}`);
  } catch (err: any) {
    logger.error(`[CHAT] commission release failed for offer ${message._id}: ${err?.message || err}`);
  }
};

// ─── Accept Offer ──────────────────────────────────────
const acceptOffer = async (
  conversationId: string,
  userId: string,
  offerMessageId: string,
  version: number,
) => {
  const uid = String(userId);

  const { conversation, message } = await loadOffer(conversationId, uid, offerMessageId);
  assertNotBlocked(conversation);

  const offer = message.offerData!;
  const isOnline = offer.paymentMethod === PaymentMethod.ONLINE;

  if (String(message.sender) === uid) {
    throw new AppError(StatusCodes.FORBIDDEN, "You cannot accept your own offer");
  }

  const isAcceptable = isOnline
    ? offer.status === OfferStatus.PENDING || offer.status === OfferStatus.AWAITING_PAYMENT
    : offer.status === OfferStatus.PENDING;
  if (!isAcceptable) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This offer is no longer pending", { code: "OFFER_NOT_PENDING" });
  }

  // The client must accept the exact terms they saw (the helper may have edited since).
  if ((offer.version || 1) !== version) {
    throw new AppError(StatusCodes.CONFLICT, "The offer changed — please review it again", {
      code: "OFFER_CHANGED",
    });
  }

  if (offer.expiresAt && new Date(offer.expiresAt).getTime() < Date.now()) {
    await expireOffer(message);
    throw new AppError(StatusCodes.GONE, "This offer has expired", { code: "OFFER_EXPIRED" });
  }

  // Both sides must still be allowed to do this job.
  const [client, helper] = await Promise.all([
    UserRepository.findById(uid, { populate: "auth" }),
    UserRepository.findById(String(message.sender), { populate: "auth" }),
  ]);
  if (!client || client.isBlocked || client.isDeleted || (client.auth as any)?.role !== "user") {
    throw new AppError(StatusCodes.FORBIDDEN, "Only a client can accept an offer", { code: "ONLY_CLIENT" });
  }
  assertApprovedHelper(helper);

  const schedule = buildSchedule(offer.date, offer.startTime, offer.endTime);
  assertScheduleNotPast(offer.date, schedule);
  await assertHelperFreeForSlot(helper!._id, schedule.startAt, schedule.endAt);

  if (isOnline) {
    // Online: reserve the offer for checkout, then the payment confirms it.
    if (offer.status === OfferStatus.PENDING) {
      const claimedOnline = await ChatRepository.claimOfferStatus(
        offerMessageId,
        OfferStatus.AWAITING_PAYMENT,
        [OfferStatus.PENDING],
      );
      if (!claimedOnline) {
        throw new AppError(StatusCodes.BAD_REQUEST, "This offer is no longer pending", { code: "OFFER_NOT_PENDING" });
      }
    }

    try {
      const amount = offer.totalAmount ?? computePricing({
        priceType: (offer.priceType || "fixed") as "fixed" | "hourly",
        amount: offer.price,
        startTime: offer.startTime,
        endTime: offer.endTime,
      }).total;

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
      // Roll back only if we just moved PENDING → AWAITING
      if (offer.status === OfferStatus.PENDING) {
        await ChatRepository.claimOfferStatus(offerMessageId, OfferStatus.PENDING, [OfferStatus.AWAITING_PAYMENT]);
      }
      throw err;
    }
  }

  // Cash — claim offer atomically, then create the job
  const claimed = await ChatRepository.updateOfferStatusIfPending(offerMessageId, OfferStatus.ACCEPTED);
  if (!claimed) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This offer is no longer pending", { code: "OFFER_NOT_PENDING" });
  }

  let job: any;
  try {
    const offerToUse = (claimed as any)?.offerData || offer;
    job = await createJobFromOffer(offerToUse, String(message.sender), uid, offerMessageId);
  } catch (err) {
    // Roll back the claim so the offer is not stuck ACCEPTED without a job
    await ChatRepository.updateOfferStatus(offerMessageId, OfferStatus.PENDING);
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

  notifyUserT(
    String(message.sender),
    "offer.accepted",
    { title: offer.title },
    {
      type: "offer_accepted",
      conversationId: String(conversationId),
      offerMessageId: String(offerMessageId),
      jobId: String(job._id),
    },
  ).catch(() => undefined);

  return { status: "accepted", jobId: job._id, paymentRequired: false };
};

// ─── Reject Offer ──────────────────────────────────────
const rejectOffer = async (conversationId: string, userId: string, offerMessageId: string) => {
  const uid = String(userId);
  const { message } = await loadOffer(conversationId, uid, offerMessageId);

  if (
    message.offerData!.status !== OfferStatus.PENDING &&
    message.offerData!.status !== OfferStatus.AWAITING_PAYMENT
  ) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This offer is no longer pending", { code: "OFFER_NOT_PENDING" });
  }
  if (String(message.sender) === uid) {
    throw new AppError(StatusCodes.FORBIDDEN, "You cannot reject your own offer");
  }
  if (message.offerData!.status === OfferStatus.AWAITING_PAYMENT && (await hasLivePayment(offerMessageId))) {
    throw new AppError(StatusCodes.CONFLICT, "A payment for this offer is in progress", {
      code: "PAYMENT_IN_PROGRESS",
    });
  }

  const rejected = await ChatRepository.claimOfferStatus(offerMessageId, OfferStatus.REJECTED, [
    OfferStatus.PENDING,
    OfferStatus.AWAITING_PAYMENT,
  ]);
  if (!rejected) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This offer is no longer pending", { code: "OFFER_NOT_PENDING" });
  }

  await emitOfferUpdated(conversationId, uid, rejected);
  await releaseOfferCommission(message);

  notifyUserT(
    String(message.sender),
    "offer.rejected",
    { title: message.offerData?.title || "" },
    {
      type: "offer_rejected",
      conversationId: String(conversationId),
      offerMessageId: String(offerMessageId),
    },
  ).catch(() => undefined);

  return { status: "rejected" };
};

// ─── Cancel Offer (Helper only, before acceptance) ─────
const cancelOffer = async (conversationId: string, userId: string, offerMessageId: string) => {
  const uid = String(userId);
  const { conversation, message } = await loadOffer(conversationId, uid, offerMessageId);

  if (
    message.offerData!.status !== OfferStatus.PENDING &&
    message.offerData!.status !== OfferStatus.AWAITING_PAYMENT
  ) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This offer is no longer pending", { code: "OFFER_NOT_PENDING" });
  }
  if (String(message.sender) !== uid) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only the offer sender can cancel");
  }
  if (message.offerData!.status === OfferStatus.AWAITING_PAYMENT && (await hasLivePayment(offerMessageId))) {
    throw new AppError(StatusCodes.CONFLICT, "A payment for this offer is in progress", {
      code: "PAYMENT_IN_PROGRESS",
    });
  }

  const cancelled = await ChatRepository.claimOfferStatus(offerMessageId, OfferStatus.CANCELLED, [
    OfferStatus.PENDING,
    OfferStatus.AWAITING_PAYMENT,
  ]);
  if (!cancelled) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This offer is no longer pending", { code: "OFFER_NOT_PENDING" });
  }

  await releaseOfferCommission(message);
  await emitOfferUpdated(conversationId, uid, cancelled);

  const otherId = getOtherParticipantId(conversation, uid);
  if (otherId) {
    notifyUserT(
      otherId,
      "offer.cancelled",
      { title: message.offerData?.title || "" },
      {
        type: "offer_cancelled",
        conversationId: String(conversationId),
        offerMessageId: String(offerMessageId),
      },
    ).catch(() => undefined);
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
  const { conversation, message } = await loadOffer(conversationId, uid, offerMessageId);
  assertNotBlocked(conversation);

  if (message.offerData!.status !== OfferStatus.PENDING) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This offer is no longer pending", { code: "OFFER_NOT_PENDING" });
  }
  if (String(message.sender) !== uid) {
    throw new AppError(StatusCodes.FORBIDDEN, "Only the offer sender can edit");
  }

  const senderUser = await UserRepository.findById(uid, { populate: "auth" });
  assertApprovedHelper(senderUser);

  const old = message.offerData!;
  const oldCommission = Number(old.commissionDeducted) || 0;
  const oldVersion = old.version || 1;
  const newVersion = oldVersion + 1;

  const price = payload.price != null ? payload.price : old.price;
  const priceType = ((payload.priceType != null ? payload.priceType : old.priceType) || "fixed") as "fixed" | "hourly";
  const startTime = payload.startTime != null ? payload.startTime : old.startTime;
  const endTime = payload.endTime != null ? payload.endTime : old.endTime;
  const date = payload.date != null ? payload.date : old.date;
  const paymentMethod = (payload.paymentMethod != null ? payload.paymentMethod : old.paymentMethod) as PaymentMethod;

  const fin = await buildOfferFinancials({
    priceType,
    price,
    startTime,
    endTime,
    paymentMethod,
    helperCategory: senderUser!.serviceType,
  });

  const schedule = buildSchedule(date, startTime, endTime);
  assertScheduleNotPast(date, schedule);

  const diff = fin.commission - oldCommission;
  const adjustRef = `offer_${offerMessageId}:v${newVersion}`;

  if (diff > 0) {
    await WalletRepository.deductCommission(uid, diff, adjustRef);
  } else if (diff < 0) {
    await WalletRepository.refundCommission(uid, Math.abs(diff), adjustRef).catch((err) =>
      logger.error(`[CHAT] commission difference refund failed for offer ${offerMessageId}: ${err?.message || err}`),
    );
  }

  const update: any = {
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    price,
    priceType,
    date,
    startTime,
    endTime,
    ...(payload.address !== undefined ? { address: payload.address } : {}),
    paymentMethod,
    commissionDeducted: fin.commission,
    totalAmount: fin.total,
    hourlyRate: fin.hourlyRate ?? null,
    hours: fin.hours ?? null,
    feePercentage: fin.feePercentage,
    helperNet: fin.helperNet,
    expiresAt: offerExpiry(),
  };
  if (payload.images !== undefined) {
    update.images = assertOwnUploadKeys(payload.images, uid, { allowed: old.images || [], kinds: ["images"] });
  }
  if (payload.longitude != null && payload.latitude != null) {
    update.location = { type: "Point", coordinates: [payload.longitude, payload.latitude] };
  }

  let updated: any;
  try {
    updated = await ChatRepository.updateOfferData(offerMessageId, update, oldVersion);
    if (!updated) {
      throw new AppError(StatusCodes.CONFLICT, "The offer changed or is no longer pending", {
        code: "OFFER_CHANGED",
      });
    }
  } catch (err) {
    // Undo the commission adjustment if the write did not happen
    if (diff > 0) {
      await WalletRepository.refundCommission(uid, diff, `${adjustRef}:undo`).catch(() => undefined);
    } else if (diff < 0) {
      await WalletRepository.deductCommission(uid, Math.abs(diff), `${adjustRef}:undo`).catch(() => undefined);
    }
    throw err;
  }

  await emitOfferUpdated(conversationId, uid, updated);
  const otherId = getOtherParticipantId(conversation, uid);
  if (otherId) {
    notifyUserT(
      otherId,
      "offer.updated",
      { title: updated.offerData?.title || "", price: fin.total },
      {
        type: "chat_offer",
        conversationId: String(conversationId),
        messageId: String(offerMessageId),
        senderId: uid,
      },
      { skipPushIfInConversation: String(conversationId) },
    ).catch(() => undefined);
  }
  return updated;
};

// ─── Mark Messages Read ────────────────────────────────
const markRead = async (conversationId: string, userId: string, messageIds: string[]) => {
  const uid = String(userId);

  const conversation = await ChatRepository.findConversationById(conversationId);
  if (!conversation) {
    throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
  }
  assertParticipant(conversation, uid);

  await ChatRepository.markMessagesRead(conversationId, uid, messageIds);
  const remaining = await ChatRepository.countUnread(conversationId, uid);
  await ChatRepository.setUnreadCount(conversationId, uid, remaining);
  return { success: true, unreadCount: remaining };
};

// ─── Helper: Create Job from Offer ─────────────────────
const createJobFromOffer = async (
  offer: any,
  helperId: string,
  clientId: string,
  offerMessageId?: string,
) => {
  const [client, helper] = await Promise.all([
    UserRepository.findById(clientId),
    UserRepository.findById(helperId, { populate: "auth" }),
  ]);
  assertApprovedHelper(helper);
  if (!client || client.isBlocked || client.isDeleted) {
    throw new AppError(StatusCodes.FORBIDDEN, "The client account is not available");
  }

  const categoryId = helper!.serviceType;
  const isHourly = (offer.priceType || "fixed") === "hourly";

  // Amounts: use what was fixed when the offer was sent/edited, else recompute.
  const pricing = offer.totalAmount
    ? { total: Number(offer.totalAmount), hourlyRate: offer.hourlyRate, hours: offer.hours }
    : computePricing({
        priceType: isHourly ? "hourly" : "fixed",
        amount: Number(offer.price),
        startTime: offer.startTime,
        endTime: offer.endTime,
      });
  const feePct: number = offer.feePercentage ?? (await SettingsService.getFeePercentage());
  const schedule = buildSchedule(offer.date, offer.startTime, offer.endTime);

  let commission = 0;
  if (offer.paymentMethod === "cash" || offer.paymentMethod === PaymentMethod.CASH) {
    if (offer.commissionDeducted != null) {
      commission = Number(offer.commissionDeducted) || 0; // already held when the offer was sent
    } else {
      commission = commissionFor(pricing.total, feePct); // legacy offers without a held commission
      if (commission > 0) {
        await WalletRepository.deductCommission(
          helperId,
          commission,
          offerMessageId ? `offer_${offerMessageId}` : `offer_${Date.now()}`,
        );
      }
    }
  }

  const offerCoords = offer.location?.coordinates;
  const location =
    Array.isArray(offerCoords) && offerCoords.length >= 2
      ? { type: "Point", coordinates: [Number(offerCoords[0]), Number(offerCoords[1])] }
      : client.location?.coordinates
        ? { type: "Point", coordinates: client.location.coordinates }
        : undefined;

  const jobData: any = {
    title: offer.title,
    description: offer.description || "",
    date: offer.date ? dayToDate(offer.date) : undefined,
    startTime: offer.startTime || "",
    endTime: offer.endTime || "",
    ...(schedule.startAt ? { startAt: schedule.startAt } : {}),
    ...(schedule.endAt ? { endAt: schedule.endAt } : {}),
    budget: pricing.total,
    budgetType: offer.priceType || "fixed",
    ...(pricing.hourlyRate ? { hourlyRate: pricing.hourlyRate, hours: pricing.hours } : {}),
    paymentMethod: offer.paymentMethod || "cash",
    paymentStatus: offer.paymentMethod === "online" ? "paid" : "pending",
    status: JobStatus.IN_PROGRESS,
    acceptedAt: new Date(),
    feePercentage: feePct,
    helperNet: offer.helperNet ?? helperNetFor(pricing.total, feePct),
    postedBy: clientId,
    assignedTo: helperId,
    images: offer.images || [],
    commissionDeducted: commission,
    isCustomOffer: true,
    category: categoryId,
    address: offer.address || client.address,
    ...(location ? { location } : {}),
  };

  let job: any;
  try {
    job = await JobRepository.create(jobData);
  } catch (err) {
    // Compensate: return commission only if deducted right here (legacy fallback)
    if (offer.commissionDeducted == null && commission > 0) {
      await WalletRepository.refundCommission(
        helperId,
        commission,
        offerMessageId ? `offer_${offerMessageId}` : `offer_${Date.now()}`,
      ).catch(() => undefined);
    }
    throw err;
  }

  await JobRepository.appendHistory(job._id, {
    action: "accepted",
    by: helperId,
    byRole: "helper",
    note: offerMessageId
      ? `Custom offer${commission > 0 ? ` · commission ${commission} MAD (${feePct}%)` : ""}`
      : undefined,
  }).catch(() => undefined);

  return job;
};

// ─── Offer maintenance (cron / account deletion) ───────
const expireOffer = async (message: any) => {
  const expired = await ChatRepository.claimOfferStatus(String(message._id), OfferStatus.EXPIRED, [
    OfferStatus.PENDING,
    OfferStatus.AWAITING_PAYMENT,
  ]);
  if (!expired) return false;
  await releaseOfferCommission(message);
  await emitOfferUpdated(String(message.conversation), String(message.sender), expired);
  notifyUserT(
    String(message.sender),
    "offer.expired",
    { title: message.offerData?.title || "" },
    { type: "offer_expired", conversationId: String(message.conversation), offerMessageId: String(message._id) },
  ).catch(() => undefined);
  return true;
};

/** Offers nobody answered in time: close them and return the held commission. */
export const expireStaleOffers = async (): Promise<number> => {
  const stale = await ChatRepository.findExpiredOffers(100);
  let n = 0;
  for (const m of stale) {
    try {
      if (await expireOffer(m)) n++;
    } catch (err) {
      logger.warn(`[CRON] expire offer ${m._id} failed: ${err}`);
    }
  }
  return n;
};

/** Account deletion: withdraw the user's own offers and reject the ones they received. */
const releaseOffersOfUser = async (userId: string) => {
  const uid = String(userId);
  const convs = await Conversation.find({ participants: uid }).select("_id").lean();
  const open = await Message.find({
    type: "offer",
    "offerData.status": { $in: ["pending", "awaiting_payment"] },
    conversation: { $in: convs.map((c) => c._id) },
  } as any).limit(500);

  for (const m of open) {
    const status = String(m.sender) === uid ? OfferStatus.CANCELLED : OfferStatus.REJECTED;
    const claimed = await ChatRepository.claimOfferStatus(String(m._id), status, [
      OfferStatus.PENDING,
      OfferStatus.AWAITING_PAYMENT,
    ]);
    if (!claimed) continue;
    await releaseOfferCommission(m);
    await emitOfferUpdated(String(m.conversation), uid, claimed);
  }
};

export const ChatService = {
  listConversations,
  getPresence,
  getUnreadTotal,
  createOrGetConversation,
  setBlocked,
  reportConversation,
  getMessages,
  sendMessage,
  sendOffer,
  acceptOffer,
  rejectOffer,
  cancelOffer,
  editOffer,
  markRead,
  createJobFromOffer,
  releaseOffersOfUser,
  expireStaleOffers,
};
