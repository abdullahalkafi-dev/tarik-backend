import { Types } from "mongoose";
import { Conversation, conversationKey } from "./conversation.model";
import { Message } from "./message.model";
import { TConversation, TMessage, OfferStatus } from "./chat.interface";
import { resolveUrl } from "../../util/minio";

// ─── Conversation Repository ───────────────────────────
const populateConversation = (id: string | Types.ObjectId) =>
  Conversation.findById(id).populate("participants", "name avatar").populate("lastMessage");

const createConversation = async (
  participantIds: string[],
): Promise<TConversation> => {
  const objectIds = participantIds.map((id) => new Types.ObjectId(id));
  const key = conversationKey(participantIds);

  // 1. One conversation per pair: look it up by the pair key, then by members (older rows).
  let conversation =
    (await Conversation.findOne({ participantsKey: key })) ||
    (await Conversation.findOne({
      participants: { $all: objectIds, $size: objectIds.length },
    }));

  if (conversation && !conversation.participantsKey) {
    await Conversation.updateOne({ _id: conversation._id }, { $set: { participantsKey: key } }).catch(
      () => undefined,
    );
  }

  // 2. If not found, create a new one (the unique key makes a double tap harmless)
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        participants: objectIds,
        participantsKey: key,
        unreadCounts: {},
      });
    } catch (err: any) {
      conversation = await Conversation.findOne({ participantsKey: key });
      if (!conversation) {
        throw err;
      }
    }
  }

  // Populate participants so Flutter can read name/avatar
  const populated = await populateConversation(conversation._id);

  return (populated || conversation) as TConversation;
};

/** Give every old conversation its pair key (run once at start-up). */
const backfillConversationKeys = async (): Promise<number> => {
  const missing = await Conversation.find({ participantsKey: { $exists: false } })
    .select("participants")
    .limit(5000)
    .lean();
  let n = 0;
  const seen = new Set<string>();
  for (const c of missing) {
    const key = conversationKey((c.participants || []).map(String));
    if (seen.has(key) || (await Conversation.exists({ participantsKey: key }))) continue; // duplicate pair: leave without key
    seen.add(key);
    await Conversation.updateOne({ _id: c._id }, { $set: { participantsKey: key } });
    n++;
  }
  return n;
};

const findConversationById = async (
  conversationId: string,
): Promise<TConversation | null> => {
  return populateConversation(conversationId);
};

const findUserConversations = async (
  userId: string,
  options: { limit?: number; before?: string } = {},
) => {
  const filter: any = {
    participants: userId,
    // A conversation shows up in the inbox once somebody wrote something.
    lastMessage: { $ne: null },
  };
  if (options.before) {
    const d = new Date(options.before);
    if (!Number.isNaN(d.getTime())) filter.lastMessageAt = { $lt: d };
  }
  return Conversation.find(filter)
    .populate("participants", "name avatar")
    .populate("lastMessage")
    .sort({ lastMessageAt: -1 })
    .limit(Math.min(options.limit || 50, 100));
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

/** Real number of messages this user has not read in the conversation. */
const countUnread = (conversationId: string, userId: string) =>
  Message.countDocuments({
    conversation: conversationId,
    sender: { $ne: userId },
    "readBy.userId": { $ne: userId },
  });

const setUnreadCount = async (conversationId: string, userId: string, count: number) => {
  await Conversation.findByIdAndUpdate(conversationId, {
    $set: { [`unreadCounts.${userId}`]: Math.max(0, count) },
  });
};

/**
 * Mark conversation read for a user.
 * Always $set 0 — opening a thread means "no unread left".
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

/** Sum of unread messages over all conversations (inbox badge). */
const totalUnread = async (userId: string): Promise<number> => {
  const rows = await Conversation.find({ participants: userId, lastMessage: { $ne: null } })
    .select("unreadCounts")
    .lean();
  let sum = 0;
  for (const r of rows) {
    const map: any = r.unreadCounts;
    const v = map instanceof Map ? map.get(userId) : map?.[userId];
    sum += Number(v) || 0;
  }
  return sum;
};

const setBlocked = (conversationId: string, userId: string, blocked: boolean) =>
  Conversation.findByIdAndUpdate(
    conversationId,
    blocked ? { $addToSet: { blockedBy: userId } } : { $pull: { blockedBy: userId } },
    { returnDocument: "after" },
  );

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

/**
 * Newest-first page, returned oldest-first for display. `before` is a message id
 * (stable cursor) or, for older apps, an ISO date.
 */
const findMessagesByConversation = async (
  conversationId: string,
  options: { page: number; limit: number; before?: string },
) => {
  const filter: any = { conversation: conversationId };
  if (options.before) {
    if (Types.ObjectId.isValid(options.before) && /^[0-9a-fA-F]{24}$/.test(options.before)) {
      filter._id = { $lt: new Types.ObjectId(options.before) };
    } else {
      const d = new Date(options.before);
      if (!Number.isNaN(d.getTime())) filter.createdAt = { $lt: d };
    }
  }

  const messages = await Message.find(filter)
    .populate("sender", "name avatar")
    .sort({ _id: -1 })
    .limit(options.limit + 1);

  const hasMore = messages.length > options.limit;
  if (hasMore) messages.pop();
  messages.reverse();

  const resolved = messages.map((msg) => resolveMessageUrls(msg.toObject()));
  const total = options.before ? undefined : await Message.countDocuments({ conversation: conversationId });

  return {
    docs: resolved,
    hasMore,
    // First message of the page = the cursor for "load older".
    nextBefore: hasMore && resolved.length ? String(resolved[0]._id) : null,
    ...(total !== undefined ? { total, totalPages: Math.ceil(total / options.limit) } : {}),
    page: options.page,
    limit: options.limit,
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
  return Message.findOneAndUpdate(filter, { $set: update }, { returnDocument: "after" });
};

/**
 * Atomically transition offer status only from PENDING.
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
  return Message.findByIdAndUpdate(messageId, { $set: update }, { returnDocument: "after" });
};

/**
 * Edit a still-PENDING offer. The write only succeeds if nobody changed the
 * offer since `expectedVersion`, and it bumps the version so a client who was
 * looking at the old terms can no longer accept them.
 */
const updateOfferData = async (
  messageId: string,
  offerData: Partial<any>,
  expectedVersion: number,
) => {
  const setFields: any = {};
  if (!offerData) return null;
  for (const key of [
    "title",
    "description",
    "price",
    "priceType",
    "date",
    "startTime",
    "endTime",
    "address",
    "location",
    "paymentMethod",
    "images",
    "commissionDeducted",
    "totalAmount",
    "hourlyRate",
    "hours",
    "feePercentage",
    "helperNet",
    "expiresAt",
  ]) {
    if (offerData[key] !== undefined) setFields[`offerData.${key}`] = offerData[key];
  }
  setFields["offerData.version"] = expectedVersion + 1;

  const filter: any = {
    _id: messageId,
    type: "offer",
    "offerData.status": OfferStatus.PENDING,
    $or: [{ "offerData.version": expectedVersion }, ...(expectedVersion === 1 ? [{ "offerData.version": { $exists: false } }] : [])],
  };
  return Message.findOneAndUpdate(filter, { $set: setFields }, { returnDocument: "after" });
};

/** Online offers stuck in AWAITING_PAYMENT longer than `hours` go back to PENDING (cron). */
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

/** Offers nobody answered before their expiry (cron). */
const findExpiredOffers = (limit = 100) =>
  Message.find({
    type: "offer",
    "offerData.status": { $in: ["pending", "awaiting_payment"] },
    $or: [
      { "offerData.expiresAt": { $lte: new Date() } },
      // Older offers without an expiry date: 48 h after they were sent.
      {
        "offerData.expiresAt": { $exists: false },
        createdAt: { $lte: new Date(Date.now() - 48 * 3_600_000) },
      },
    ],
  } as any)
    .limit(limit);

const countOpenOffersBySender = (senderId: string) =>
  Message.countDocuments({
    sender: senderId,
    type: "offer",
    "offerData.status": { $in: ["pending", "awaiting_payment"] },
  } as any);

const findOpenOffersOfUser = (userId: string) =>
  Message.find({
    type: "offer",
    "offerData.status": { $in: ["pending", "awaiting_payment"] },
    $or: [{ sender: userId }],
  } as any).limit(200);

const findUnreadMessages = async (conversationId: string, userId: string) => {
  return Message.find({
    conversation: conversationId,
    sender: { $ne: userId },
    "readBy.userId": { $ne: userId },
  }).select("_id");
};

export const ChatRepository = {
  createConversation,
  backfillConversationKeys,
  findConversationById,
  findUserConversations,
  updateConversationLastMessage,
  countUnread,
  setUnreadCount,
  markConversationRead,
  totalUnread,
  setBlocked,
  createMessage,
  findMessagesByConversation,
  markMessagesRead,
  findMessageById,
  updateOfferStatus,
  updateOfferStatusIfPending,
  claimOfferStatus,
  updateOfferData,
  expireStuckAwaitingPayment,
  findExpiredOffers,
  countOpenOffersBySender,
  findOpenOffersOfUser,
  findUnreadMessages,
};
