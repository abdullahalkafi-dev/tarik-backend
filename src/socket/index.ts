import http from "http";
import { createClient, RedisClientType } from "../redis/redisPackage";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import config from "config";
import { logger } from "logger/logger";
import redisClient from "../redis/redisClient";
import { clearSocketServer, emitPresenceUpdate, getConversationRoom, getUserRoom, setSocketServer } from "./socket.gateway";
import { socketAuthMiddleware } from "./socket.auth";
import { SocketPresenceService } from "./socket.presence";
import { ChatService } from "../module/chat/chat.service";
import { Conversation } from "../module/chat/conversation.model";

let ioInstance: Server | null = null;
let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;

const getAllowedOrigins = () => {
  if (config.node_env === "production") {
    return ["https://yourdomain.com"];
  }
  return ["http://localhost:3000", "http://localhost:3001"];
};

const attachRedisAdapter = async (io: Server) => {
  if (!redisClient.isAvailable()) {
    logger.warn("Socket.IO Redis adapter disabled: Redis is unavailable");
    return;
  }

  pubClient = createClient({
    url: `redis://${config.redis.host}:${config.redis.port}`,
    password: config.redis.password || undefined,
  });
  subClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  logger.info("Socket.IO Redis adapter enabled");
};

export const initializeSocketServer = async (server: http.Server) => {
  if (ioInstance) return ioInstance;

  const io = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true,
    },
  });

  setSocketServer(io);
  await attachRedisAdapter(io);

  io.use(socketAuthMiddleware);

  io.on("connection", async (socket) => {
    const userId = String(socket.data.userId);
    socket.join(getUserRoom(userId));

    const presenceState = await SocketPresenceService.addConnection(userId, socket.id);
    if (presenceState.becameOnline) {
      emitPresenceUpdate(userId, true);
    }

    // ─── Chat Events ─────────────────────────────────
    socket.on("chat:join", async ({ conversationId }: { conversationId: string }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const isParticipant = conversation.participants.some(
          (p: any) => String(p) === userId,
        );
        if (!isParticipant) return;

        socket.join(getConversationRoom(conversationId));
      } catch (_) {}
    });

    socket.on("chat:leave", ({ conversationId }: { conversationId: string }) => {
      socket.leave(getConversationRoom(conversationId));
    });

    socket.on(
      "chat:send",
      async (data: {
        conversationId: string;
        type: "text" | "image" | "video";
        content?: string;
        images?: string[];
        video?: string;
      }) => {
        try {
          const message = await ChatService.sendMessage(
            data.conversationId,
            userId,
            {
              type: data.type,
              content: data.content,
              images: data.images,
              video: data.video,
            },
          );
          io.to(getConversationRoom(data.conversationId)).emit("chat:receive", message);
          // Keep conversation list in sync for the peer (parity with REST path)
          try {
            const conv = await Conversation.findById(data.conversationId).select("participants");
            const other = (conv?.participants || []).find(
              (p: any) => String(p) !== userId,
            );
            if (other) {
              io.to(getUserRoom(String(other))).emit("chat:conversation_updated", {
                conversationId: data.conversationId,
                lastMessage: message,
              });
            }
          } catch (_) {}
        } catch (error) {
          socket.emit("chat:error", { message: "Failed to send message" });
        }
      },
    );

    socket.on(
      "typing:start",
      async ({ conversationId }: { conversationId: string }) => {
        try {
          const conversation = await Conversation.findById(conversationId).select("participants");
          if (!conversation) return;
          const isParticipant = conversation.participants.some(
            (p: any) => String(p) === userId,
          );
          if (!isParticipant) return;

          socket
            .to(getConversationRoom(conversationId))
            .emit("typing:start", { userId, conversationId });
        } catch (_) {}
      },
    );

    socket.on(
      "typing:stop",
      async ({ conversationId }: { conversationId: string }) => {
        try {
          const conversation = await Conversation.findById(conversationId).select("participants");
          if (!conversation) return;
          const isParticipant = conversation.participants.some(
            (p: any) => String(p) === userId,
          );
          if (!isParticipant) return;

          socket
            .to(getConversationRoom(conversationId))
            .emit("typing:stop", { userId, conversationId });
        } catch (_) {}
      },
    );

    socket.on(
      "chat:read",
      async (data: { conversationId: string; messageIds: string[] }) => {
        try {
          const conversation = await Conversation.findById(data.conversationId).select("participants");
          if (!conversation) return;
          const isParticipant = conversation.participants.some(
            (p: any) => String(p) === userId,
          );
          if (!isParticipant) return;

          await ChatService.markRead(
            data.conversationId,
            userId,
            data.messageIds,
          );
          socket
            .to(getConversationRoom(data.conversationId))
            .emit("chat:read", { userId, messageIds: data.messageIds });
        } catch (error) {
          // silent fail for read receipts
        }
      },
    );

    // ─── Support Events ─────────────────────────────────
    socket.on("support:join", async ({ ticketId }: { ticketId: string }) => {
      try {
        const { SupportTicket } = await import("../module/support/support.model");
        const ticket = await SupportTicket.findById(ticketId).select("user");
        if (!ticket) return;
        const isAdmin = socket.data.role === "admin" || socket.data.role === "superAdmin" || socket.data.role === "staff";
        const isOwner = String(ticket.user) === userId;
        if (isAdmin || isOwner) {
          socket.join(`support:${ticketId}`);
        }
      } catch (_) {}
    });

    socket.on("support:leave", ({ ticketId }: { ticketId: string }) => {
      socket.leave(`support:${ticketId}`);
    });

    socket.on("disconnect", async () => {
      const nextState = await SocketPresenceService.removeConnection(socket.id);
      if (nextState.userId && nextState.becameOffline) {
        emitPresenceUpdate(nextState.userId, false);
      }
    });
  });

  ioInstance = io;
  logger.info("Socket.IO server initialized");

  return io;
};

export const closeSocketServer = async () => {
  await Promise.all([
    pubClient?.disconnect(),
    subClient?.disconnect(),
  ]);

  pubClient = null;
  subClient = null;

  if (ioInstance) {
    await ioInstance.close();
    ioInstance = null;
  }

  clearSocketServer();
};
