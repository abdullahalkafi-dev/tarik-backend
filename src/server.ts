import mongoose from "mongoose";
import http from "http";
import redisClient from "./redis/redisClient";
import app from "./app";
import config from "./config";
import { errorLogger, logger } from "./logger/logger";
import ConnectDB from "./db";
import { syncUserIndexes } from "module/user/user.model";
import { syncAuthIndexes } from "module/auth/auth.model";
import { closeSocketServer, initializeSocketServer } from "./socket";
import { ensureBucket } from "./util/minio";
import { runSeed } from "./db/seed";
import { startMaintenanceJobs } from "./jobs/maintenance";
import { ChatRepository } from "./module/chat/chat.repository";
import { Conversation } from "./module/chat/conversation.model";
import { Message } from "./module/chat/message.model";
import { Session } from "./module/auth/session.model";
import { WalletTransactionLedger } from "./module/wallet/walletTransaction.model";
import { Job } from "./module/job/job.model";
import { Category } from "./module/category/category.model";
import { SupportTicket } from "./module/support/support.model";
import { AppNotification } from "./module/notification/notification.model";

const server = http.createServer(app);

export { server };

async function main() {
  try {
    // 1. Connect MongoDB
    await ConnectDB();

    // 2. Ensure indexes. One index that cannot be built (for example a new unique
    //    index while old duplicate data still exists) must be reported loudly but
    //    must never stop the API from starting.
    const indexJobs: [string, () => Promise<unknown>][] = [
      ["users", syncUserIndexes],
      ["auths", syncAuthIndexes],
      ["sessions", () => Session.init()],
      ["conversations", () => Conversation.init()],
      ["messages", () => Message.init()],
      ["wallet ledger", () => WalletTransactionLedger.init()],
      ["jobs", () => Job.init()],
      ["categories", () => Category.init()],
      ["support tickets", () => SupportTicket.init()],
      ["notifications", () => AppNotification.init()],
    ];
    for (const [label, run] of indexJobs) {
      try {
        await run();
      } catch (error) {
        errorLogger.error(`Index build failed for ${label} — fix the data and restart`, {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    try {
      const keyed = await ChatRepository.backfillConversationKeys();
      if (keyed) logger.info(`Backfilled pair keys on ${keyed} conversation(s)`);
    } catch (error) {
      logger.warn(`Conversation key backfill skipped: ${error instanceof Error ? error.message : error}`);
    }

    // 3. Seed admin/test data — never let a seed failure take the API down
    try {
      await runSeed();
    } catch (error) {
      errorLogger.error("Seed failed, continuing startup", error);
    }

    // 3. Connect Redis
    try {
      await redisClient.connect();
      logger.info("Redis connected successfully");
    } catch (error) {
      logger.warn(
        `Redis unavailable, continuing without cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 4. Initialize MinIO bucket
    try {
      await ensureBucket();
      logger.info("MinIO bucket ensured");
    } catch (error) {
      logger.warn(
        `MinIO unavailable, continuing without file storage: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 5. Initialize Socket.IO
    if (config.socket.enabled) {
      await initializeSocketServer(server);
    }

    // 6. Background jobs
    try {
      startMaintenanceJobs();
    } catch (err) {
      logger.warn(`Failed to start cron jobs: ${err}`);
    }

    // 6. Start server
    const port = Number(config.port) || 5000;
    server.listen(port, "0.0.0.0", () => {
      logger.info(`Server listening on 0.0.0.0:${port}`);
      logger.info(`Environment: ${config.node_env}`);
    });
  } catch (error) {
    errorLogger.error("Failed to start server", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main();

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  try {
    await new Promise<void>((resolve) => {
      if (server.closeAllConnections) {
        server.closeAllConnections();
      }
      server.close(() => {
        logger.info("HTTP server closed");
        resolve();
      });
    });

    await closeSocketServer();
    logger.info("Socket.IO server closed");

    await redisClient.disconnect();
    logger.info("Redis disconnected");

    await mongoose.connection.close();
    logger.info("MongoDB disconnected");

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    errorLogger.error("Error during shutdown", {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }
}

// MongoDB event listeners
mongoose.connection.on("error", (err: Error) => {
  errorLogger.error("MongoDB connection error", {
    message: err.message,
    stack: err.stack,
  });
});

mongoose.connection.on("disconnected", () => {
  logger.info("MongoDB disconnected");
});

// Process event handlers
process.on("uncaughtException", (error: Error) => {
  errorLogger.error("Uncaught Exception", {
    message: error.message,
    stack: error.stack,
  });
  setTimeout(() => process.exit(1), 1000);
});

// A single rejected promise (for example a socket handler during a Redis
// hiccup) must not take the whole API down for every user: log and continue.
process.on("unhandledRejection", (reason: unknown) => {
  errorLogger.error("Unhandled Rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
