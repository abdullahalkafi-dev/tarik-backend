import { Server } from "socket.io";

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

export const emitToConversation = (
  conversationId: string,
  event: string,
  payload: unknown,
) => {
  ioInstance?.to(getConversationRoom(conversationId)).emit(event, payload);
};

export const emitPresenceUpdate = (userId: string, isOnline: boolean) => {
  ioInstance?.emit("presence:update", { userId, isOnline });
};

export const disconnectUserSockets = (userId: string) => {
  try {
    ioInstance?.in(getUserRoom(userId)).disconnectSockets(true);
  } catch (err) {
    console.error(`[SOCKET] Error disconnecting sockets for user ${userId}:`, err);
  }
};
