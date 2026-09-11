import cron from "node-cron";
import { Job } from "../module/job/job.model";
import { JobStatus } from "../module/job/job.interface";
import { logger } from "../logger/logger";

/**
 * Expire abandoned online checkouts.
 * Jobs stuck in pending_payment for > 24h are cancelled so they don't linger.
 */
export const startExpirePendingPaymentJobs = () => {
  // Every hour at minute 7
  cron.schedule("7 * * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await Job.updateMany(
        {
          status: JobStatus.PENDING_PAYMENT,
          paymentMethod: "online",
          createdAt: { $lt: cutoff },
        } as any,
        {
          $set: {
            status: JobStatus.CANCELLED,
            cancellationReason: "Payment not completed within 24 hours",
            cancelledAt: new Date(),
            refundStatus: "none",
          },
        },
      );
      if (result.modifiedCount > 0) {
        logger.info(
          `[CRON] Expired ${result.modifiedCount} pending_payment job(s) older than 24h`,
        );
      }
    } catch (err) {
      logger.error("[CRON] expirePendingPaymentJobs failed", err);
    }
  });

  logger.info("[CRON] expirePendingPaymentJobs scheduled (hourly, 24h TTL)");
};
