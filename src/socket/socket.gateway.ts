import { Server } from "socket.io";
import { logger } from "../logger/logger";

let ioInstance: Server | null = null;

export const setSocketServer = (io: Server) => {
  ioInstance = io;
};

export const clearSocketServer = () => {
  ioInstance = null;
};

export const getSocketServer = () => {
  return ioInstance;
};

export const getUserRoom = (userId: string) => {
  return `user:${userId}`;
};

export const getConversationRoom = (conversationId: string) => {
  return `conversation:${conversationId}`;
};

export const emitToUser = (userId: string, event: string, payload: unknown) => {
  ioInstance?.to(getUserRoom(userId)).emit(event, payload);
};

export const emitToUsers = (userIds: string[], event: string, payload: unknown) => {
  if (!ioInstance || !userIds.length) return;
  ioInstance.to(userIds.map(getUserRoom)).emit(event, payload);
};

export const emitToConversation = (
  conversationId: string,
  event: string,
  payload: unknown,
) => {
  ioInstance?.to(getConversationRoom(conversationId)).emit(event, payload);
};

/**
 * Presence is only told to the people who can actually see it: the user's chat
 * partners (not every connected user — that is N² traffic and a privacy leak).
 */
export const emitPresenceUpdate = async (userId: string, isOnline: boolean) => {
  if (!ioInstance) return;
  try {
    const { Conversation } = await import("../module/chat/conversation.model");
    const conversations = await Conversation.find({ participants: userId })
      .select("participants")
      .limit(500)
      .lean();
    const partners = new Set<string>();
    for (const c of conversations) {
      for (const p of c.participants || []) {
        if (String(p) !== String(userId)) partners.add(String(p));
      }
    }
    if (!partners.size) return;
    ioInstance.to([...partners].map(getUserRoom)).emit("presence:update", { userId, isOnline });
  } catch (err) {
    logger.warn(`[SOCKET] presence broadcast failed: ${err instanceof Error ? err.message : err}`);
  }
};

/** True when one of the user's sockets (on any server node) is inside the conversation room. */
export const isUserInConversationRoom = async (
  userId: string,
  conversationId: string,
): Promise<boolean> => {
  if (!ioInstance) return false;
  const sockets = await ioInstance.in(getConversationRoom(conversationId)).fetchSockets();
  return sockets.some((s) => String(s.data?.userId) === String(userId));
};

export const disconnectUserSockets = (userId: string) => {
  try {
    ioInstance?.in(getUserRoom(userId)).disconnectSockets(true);
  } catch (err) {
    logger.warn(`[SOCKET] Error disconnecting sockets for user ${userId}: ${err}`);
  }
};
