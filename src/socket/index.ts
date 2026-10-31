import http from "http";
import { createClient, RedisClientType } from "../redis/redisPackage";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import config from "config";
import { logger } from "logger/logger";
import redisClient from "../redis/redisClient";
import {
  clearSocketServer,
  emitPresenceUpdate,
  emitToUser,
  getConversationRoom,
  getUserRoom,
  setSocketServer,
} from "./socket.gateway";
import { socketAuthMiddleware } from "./socket.auth";
import { SocketPresenceService } from "./socket.presence";
import { ChatService } from "../module/chat/chat.service";
import { Conversation } from "../module/chat/conversation.model";
import { ChatRepository } from "../module/chat/chat.repository";
import {
  socketConversationSchema,
  socketReadSchema,
  socketSendMessageSchema,
} from "../module/chat/chat.dto";
import { SocketTrackingService, getTrackingRoom } from "./socket.tracking";
import { getAllowedOrigins } from "../config/origins";
import { User } from "../module/user/user.model";
import { Job } from "../module/job/job.model";
import { Auth } from "../module/auth/auth.model";
import { UserService } from "../module/user/user.service";
import { haversineKm } from "../util/geo";
import { isCoordinateInAllowedRegion } from "../util/geo";

let ioInstance: Server | null = null;
let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;

const STAFF_ROLES = ["admin", "superAdmin", "staff"];

type Ack = (response: { ok: boolean; code?: string; message?: string; [k: string]: unknown }) => void;

/** Last argument of an event is the acknowledgement callback, when the client sent one. */
const ackOf = (args: unknown[]): Ack | undefined => {
  const last = args[args.length - 1];
  return typeof last === "function" ? (last as Ack) : undefined;
};

/**
 * Wraps a socket handler so that an exception (a Redis hiccup, a bad payload…)
 * is logged and answered — never an unhandled rejection that could take the
 * whole API down.
 */
const safe =
  <A extends unknown[]>(name: string, handler: (...args: A) => Promise<void> | void) =>
  async (...args: A) => {
    try {
      await handler(...args);
    } catch (error: any) {
      logger.warn(`[SOCKET] ${name} failed: ${error?.message || error}`);
      ackOf(args as unknown[])?.({
        ok: false,
        code: error?.code || "ERROR",
        message: typeof error?.message === "string" ? error.message : "Request failed",
      });
    }
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
  // Never let a Redis error event become an uncaught exception.
  pubClient.on("error", (e: Error) => logger.warn(`[SOCKET] adapter pub error: ${e.message}`));
  subClient.on("error", (e: Error) => logger.warn(`[SOCKET] adapter sub error: ${e.message}`));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  logger.info("Socket.IO Redis adapter enabled");
};

/** Is `userId` a participant of the conversation? (one DB read, then cached per socket) */
const joinedConversations = (socket: Socket): Set<string> => {
  if (!socket.data.joinedConversations) socket.data.joinedConversations = new Set<string>();
  return socket.data.joinedConversations as Set<string>;
};

const ensureMember = async (socket: Socket, userId: string, conversationId: string): Promise<boolean> => {
  const cache = joinedConversations(socket);
  if (cache.has(conversationId)) return true;
  const conversation = await Conversation.findById(conversationId).select("participants blockedBy").lean();
  const ok = !!conversation && (conversation.participants || []).some((p: any) => String(p) === userId);
  if (ok) cache.add(conversationId);
  return ok;
};

export const initializeSocketServer = async (server: http.Server) => {
  if (ioInstance) return ioInstance;

  const io = new Server(server, {
    cors: {
      origin: config.cors.strict ? getAllowedOrigins() : true,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Allow the HTTP long-polling fallback for restrictive networks (it upgrades to websocket when possible).
    transports: ["websocket", "polling"],
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });

  setSocketServer(io);
  await attachRedisAdapter(io);

  io.use(socketAuthMiddleware);

  io.on("connection", async (socket) => {
    const userId = String(socket.data.userId);
    const authId = String(socket.data.authId || "");
    socket.join(getUserRoom(userId));

    try {
      const presenceState = await SocketPresenceService.addConnection(userId, socket.id);
      if (presenceState.becameOnline) {
        emitPresenceUpdate(userId, true).catch(() => undefined);
      }
    } catch (error) {
      logger.warn(`[SOCKET] presence on connect failed: ${error instanceof Error ? error.message : error}`);
    }

    // The account can be suspended / its password changed while the socket stays open:
    // re-check regularly (explicit bans also disconnect immediately).
    const recheck = setInterval(async () => {
      try {
        const [auth, user] = await Promise.all([
          Auth.findById(authId).select("isDeleted isBlacklisted status tokenVersion").lean(),
          User.findById(userId).select("isBlocked isDeleted").lean(),
        ]);
        if (
          !auth ||
          auth.isDeleted ||
          auth.isBlacklisted ||
          auth.status === "suspended" ||
          !user ||
          user.isBlocked ||
          user.isDeleted
        ) {
          socket.disconnect(true);
        }
      } catch (_) {
        // transient DB error: try again next round
      }
    }, 10 * 60_000);
    recheck.unref?.();

    // ─── Chat Events ─────────────────────────────────
    socket.on(
      "chat:join",
      safe("chat:join", async (payload: unknown, _ack?: Ack) => {
        const ack = ackOf([payload, _ack]);
        const parsed = socketConversationSchema.safeParse(payload);
        if (!parsed.success) return ack?.({ ok: false, code: "INVALID_PAYLOAD" });
        const { conversationId } = parsed.data;
        if (!(await ensureMember(socket, userId, conversationId))) {
          return ack?.({ ok: false, code: "FORBIDDEN" });
        }
        socket.join(getConversationRoom(conversationId));
        ack?.({ ok: true });
      }),
    );

    socket.on(
      "chat:leave",
      safe("chat:leave", (payload: any, _ack?: Ack) => {
        if (payload?.conversationId) {
          socket.leave(getConversationRoom(String(payload.conversationId)));
          joinedConversations(socket).delete(String(payload.conversationId));
        }
        ackOf([payload, _ack])?.({ ok: true });
      }),
    );

    socket.on(
      "chat:send",
      safe("chat:send", async (payload: unknown, _ack?: Ack) => {
        const ack = ackOf([payload, _ack]);
        // Same validation as the REST endpoint — the socket is not a back door.
        const parsed = socketSendMessageSchema.safeParse(payload);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message || "Invalid message";
          socket.emit("chat:error", { message, code: "INVALID_PAYLOAD" });
          return ack?.({ ok: false, code: "INVALID_PAYLOAD", message });
        }
        const { conversationId, ...body } = parsed.data;
        try {
          const message = await ChatService.sendMessage(conversationId, userId, body);
          io.to(getConversationRoom(conversationId)).emit("chat:receive", message);
          const conv = await ChatRepository.findConversationById(conversationId);
          const other = (conv?.participants || []).find((p: any) => String(p._id ?? p) !== userId);
          if (other) {
            emitToUser(String(other._id ?? other), "chat:conversation_updated", {
              conversationId,
              lastMessage: message,
            });
          }
          ack?.({ ok: true, message });
        } catch (error: any) {
          const code = error?.code || "SEND_FAILED";
          const text = typeof error?.message === "string" ? error.message : "Failed to send message";
          socket.emit("chat:error", { message: text, code, conversationId });
          ack?.({ ok: false, code, message: text });
        }
      }),
    );

    // Typing: only inside rooms this socket joined (no database read per keystroke), throttled.
    const lastTypingAt = new Map<string, number>();
    socket.on(
      "typing:start",
      safe("typing:start", async (payload: any) => {
        const conversationId = String(payload?.conversationId || "");
        if (!/^[0-9a-fA-F]{24}$/.test(conversationId)) return;
        if (!joinedConversations(socket).has(conversationId)) return;
        const now = Date.now();
        if (now - (lastTypingAt.get(conversationId) || 0) < 1500) return;
        lastTypingAt.set(conversationId, now);
        socket.to(getConversationRoom(conversationId)).emit("typing:start", { userId, conversationId });
      }),
    );

    socket.on(
      "typing:stop",
      safe("typing:stop", async (payload: any) => {
        const conversationId = String(payload?.conversationId || "");
        if (!/^[0-9a-fA-F]{24}$/.test(conversationId)) return;
        if (!joinedConversations(socket).has(conversationId)) return;
        lastTypingAt.delete(conversationId);
        socket.to(getConversationRoom(conversationId)).emit("typing:stop", { userId, conversationId });
      }),
    );

    socket.on(
      "chat:read",
      safe("chat:read", async (payload: unknown, _ack?: Ack) => {
        const ack = ackOf([payload, _ack]);
        const parsed = socketReadSchema.safeParse(payload);
        if (!parsed.success) return ack?.({ ok: false, code: "INVALID_PAYLOAD" });
        const { conversationId, messageIds } = parsed.data;
        if (!(await ensureMember(socket, userId, conversationId))) return ack?.({ ok: false, code: "FORBIDDEN" });

        await ChatService.markRead(conversationId, userId, messageIds);
        socket.to(getConversationRoom(conversationId)).emit("chat:read", { userId, conversationId, messageIds });
        ack?.({ ok: true });
      }),
    );

    // ─── Support Events ─────────────────────────────────
    socket.on(
      "support:join",
      safe("support:join", async (payload: any, _ack?: Ack) => {
        const ack = ackOf([payload, _ack]);
        const ticketId = String(payload?.ticketId || "");
        if (!/^[0-9a-fA-F]{24}$/.test(ticketId)) return ack?.({ ok: false, code: "INVALID_PAYLOAD" });
        const { SupportTicket } = await import("../module/support/support.model");
        const ticket = await SupportTicket.findById(ticketId).select("user").lean();
        if (!ticket) return ack?.({ ok: false, code: "NOT_FOUND" });
        const isAdmin = STAFF_ROLES.includes(String(socket.data.role));
        if (isAdmin || String(ticket.user) === userId) {
          socket.join(`support:${ticketId}`);
          return ack?.({ ok: true });
        }
        ack?.({ ok: false, code: "FORBIDDEN" });
      }),
    );

    socket.on(
      "support:leave",
      safe("support:leave", (payload: any) => {
        if (payload?.ticketId) socket.leave(`support:${String(payload.ticketId)}`);
      }),
    );

    // Staff watch the support inbox in real time instead of polling.
    if (STAFF_ROLES.includes(String(socket.data.role))) {
      socket.join("support:admins");
    }

    // ─── Tracking Events ─────────────────────────────────
    // A helper's position is accepted only from an approved helper, only
    // inside the service area, at most every ~4 s, and — when it names a job —
    // only for a job assigned to that helper that is under way.
    let lastPingAt = 0;
    let helperCache: { ok: boolean; available: boolean; until: number } | null = null;
    const jobCache = new Map<string, { ok: boolean; until: number }>();
    let lastSaved: { at: number; lat: number; lon: number } | null = null;

    const helperState = async () => {
      if (helperCache && helperCache.until > Date.now()) return helperCache;
      const u = await User.findById(userId).select("helperApplicationStatus isAvailable isBlocked isDeleted").lean();
      helperCache = {
        ok: !!u && u.helperApplicationStatus === "approved" && !u.isBlocked && !u.isDeleted,
        available: !!u && u.isAvailable !== false,
        until: Date.now() + 60_000,
      };
      return helperCache;
    };

    const jobAllowed = async (jobId: string) => {
      const cached = jobCache.get(jobId);
      if (cached && cached.until > Date.now()) return cached.ok;
      const ok = !!(await Job.exists({
        _id: jobId,
        assignedTo: userId,
        status: { $in: ["in_progress", "on_the_way", "arrived"] },
      } as any));
      jobCache.set(jobId, { ok, until: Date.now() + 60_000 });
      return ok;
    };

    socket.on(
      "helper:location_ping",
      safe("helper:location_ping", async (data: any) => {
        const now = Date.now();
        if (now - lastPingAt < 4000) return;
        lastPingAt = now;

        const lat = Number(data?.latitude);
        const lon = Number(data?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isCoordinateInAllowedRegion(lat, lon)) return;

        const state = await helperState();
        if (!state.ok) return;

        let jobId: string | undefined;
        if (typeof data?.jobId === "string" && /^[0-9a-fA-F]{24}$/.test(data.jobId)) {
          if (await jobAllowed(data.jobId)) jobId = data.jobId;
        }
        // Without a live job, only helpers who are "on duty" are tracked.
        if (!jobId && !state.available) return;

        const clamp = (v: unknown, min: number, max: number) => {
          const n = Number(v);
          return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : undefined;
        };

        await SocketTrackingService.recordHelperLocation(userId, {
          latitude: lat,
          longitude: lon,
          heading: clamp(data?.heading, 0, 360),
          speed: clamp(data?.speed, 0, 100),
          jobId,
        });

        // Keep the profile's "last known position" fresh (every 5 min or 500 m) so job matching reflects reality.
        if (
          !lastSaved ||
          now - lastSaved.at > 5 * 60_000 ||
          haversineKm(lastSaved.lat, lastSaved.lon, lat, lon) > 0.5
        ) {
          lastSaved = { at: now, lat, lon };
          UserService.saveLastKnownLocation(userId, lon, lat).catch(() => undefined);
        }
      }),
    );

    socket.on(
      "tracking:join",
      safe("tracking:join", async (payload: any, _ack?: Ack) => {
        const ack = ackOf([payload, _ack]);
        const jobId = String(payload?.jobId || "");
        if (!/^[0-9a-fA-F]{24}$/.test(jobId)) return ack?.({ ok: false, code: "INVALID_PAYLOAD" });
        const job = await Job.findById(jobId).select("postedBy assignedTo status").lean();
        if (!job) return ack?.({ ok: false, code: "NOT_FOUND" });

        const isAdmin = STAFF_ROLES.includes(String(socket.data.role));
        const isParticipant = String(job.postedBy) === userId || String(job.assignedTo) === userId;
        if (!isAdmin && !isParticipant) return ack?.({ ok: false, code: "FORBIDDEN" });

        socket.join(getTrackingRoom(jobId));
        // If a helper is assigned, immediately send their cached coordinates
        if (job.assignedTo && ["on_the_way", "arrived", "in_progress"].includes(String(job.status))) {
          const latest = await SocketTrackingService.getHelperLatestLocation(String(job.assignedTo));
          if (latest) socket.emit("tracking:location_update", { ...latest, jobId });
        }
        ack?.({ ok: true });
      }),
    );

    socket.on(
      "tracking:leave",
      safe("tracking:leave", (payload: any) => {
        if (payload?.jobId) socket.leave(getTrackingRoom(String(payload.jobId)));
      }),
    );

    socket.on(
      "disconnect",
      safe("disconnect", async () => {
        clearInterval(recheck);
        const nextState = await SocketPresenceService.removeConnection(socket.id);
        if (nextState.userId && nextState.becameOffline) {
          emitPresenceUpdate(nextState.userId, false).catch(() => undefined);
          await SocketTrackingService.removeHelper(nextState.userId);
        }
      }),
    );
  });

  SocketPresenceService.startHeartbeat();
  ioInstance = io;
  logger.info("Socket.IO server initialized");

  return io;
};

export const closeSocketServer = async () => {
  SocketPresenceService.stopHeartbeat();
  await Promise.all([
    pubClient?.isOpen ? pubClient.disconnect() : undefined,
    subClient?.isOpen ? subClient.disconnect() : undefined,
  ]);

  pubClient = null;
  subClient = null;

  if (ioInstance) {
    await ioInstance.close();
    ioInstance = null;
  }

  clearSocketServer();
};
