import os from "os";
import cron from "node-cron";
import { logger } from "../logger/logger";
import redisClient from "../redis/redisClient";
import { Job } from "../module/job/job.model";
import { ACTIVE_JOB_STATUSES } from "../module/job/job.interface";
import {
  autoCompleteDueJobs,
  expireStaleOpenJobs,
  expireUnpaidJobs,
  reconcileOnlinePayouts,
} from "../module/job/job.service";
import { expireStaleOffers } from "../module/chat/chat.service";
import { ChatRepository } from "../module/chat/chat.repository";
import { PaymentRepository } from "../module/payment/payment.repository";
import { WalletTransactionLedger } from "../module/wallet/walletTransaction.model";
import { Auth } from "../module/auth/auth.model";
import { User } from "../module/user/user.model";
import { notifyUserT } from "../util/notifyUser";
import { notifyAdmins } from "../util/notifyAdmins";
import { listMinioObjects, deleteFromMinio } from "../util/minio";
import { isKeyInUse } from "../module/upload/upload.service";
import { BUSINESS_TZ } from "../util/schedule";

const options = { timezone: BUSINESS_TZ };

/**
 * Runs `fn` on one server only: the first instance to take the lock wins, the
 * others skip that round. (Without Redis every instance runs it — harmless,
 * every task below is idempotent.)
 */
const withLock = async (name: string, ttlSeconds: number, fn: () => Promise<unknown>) => {
  try {
    const acquired = await redisClient.setNX(`lock:cron:${name}`, os.hostname(), ttlSeconds);
    if (!acquired) return;
    const result = await fn();
    if (typeof result === "number" && result > 0) {
      logger.info(`[CRON] ${name}: ${result} item(s) processed`);
    }
  } catch (err) {
    logger.error(`[CRON] ${name} failed: ${err instanceof Error ? err.stack || err.message : err}`);
  }
};

/** "Your job starts in about two hours" — once per job, to both people. */
const sendUpcomingReminders = async (): Promise<number> => {
  const now = Date.now();
  const jobs = await Job.find({
    status: { $in: ACTIVE_JOB_STATUSES },
    startAt: { $gte: new Date(now + 90 * 60_000), $lte: new Date(now + 150 * 60_000) },
    reminderSentAt: { $exists: false },
  } as any)
    .select("title startAt postedBy assignedTo")
    .limit(200)
    .lean();

  for (const j of jobs) {
    // Claim first so two servers can never both send it.
    const claimed = await Job.updateOne(
      { _id: j._id, reminderSentAt: { $exists: false } } as any,
      { $set: { reminderSentAt: new Date() } },
    );
    if (!claimed.modifiedCount) continue;
    const time = new Date(j.startAt as Date).toLocaleTimeString("fr-MA", {
      timeZone: BUSINESS_TZ,
      hour: "2-digit",
      minute: "2-digit",
    });
    for (const uid of [j.postedBy, j.assignedTo].filter(Boolean)) {
      notifyUserT(String(uid), "job.reminder_soon", { title: j.title, time }, { type: "job_reminder", jobId: String(j._id) }).catch(
        () => undefined,
      );
    }
  }
  return jobs.length;
};

/** Money movements written to the ledger but never confirmed — needs a human look. */
const watchUnconfirmedLedger = async (): Promise<number> => {
  const stuck = await WalletTransactionLedger.countDocuments({
    applied: false,
    createdAt: { $lt: new Date(Date.now() - 10 * 60_000) },
  } as any);
  if (stuck > 0) {
    logger.error(`[CRON] ${stuck} wallet ledger entries are unconfirmed (applied=false)`);
    notifyAdmins("Wallet entries need review", `${stuck} wallet movements were not confirmed. Check the ledger.`, {
      type: "ledger_review",
    }, "payments.view").catch(() => undefined);
  }
  return stuck;
};

/** Sign-ups that never entered the code within two days are removed (frees the phone number). */
const removeAbandonedSignups = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - 48 * 3_600_000);
  const abandoned = await Auth.find({
    isPhoneVerified: false,
    isDeleted: false,
    createdAt: { $lt: cutoff },
    role: { $in: ["user", "helper"] },
  } as any)
    .select("_id")
    .limit(200)
    .lean();
  if (!abandoned.length) return 0;
  const ids = abandoned.map((a) => a._id);
  await User.deleteMany({ auth: { $in: ids } });
  await Auth.deleteMany({ _id: { $in: ids } });
  return ids.length;
};

/** Uploaded files that no record points to after 3 days (abandoned drafts) are deleted from storage. */
const removeOrphanUploads = async (): Promise<number> => {
  const cutoff = Date.now() - 3 * 24 * 3_600_000;
  let removed = 0;
  let inspected = 0;

  for (const prefix of ["images/", "videos/", "documents/"]) {
    await new Promise<void>((resolve) => {
      const stream = listMinioObjects(prefix);
      const queue: { name: string }[] = [];
      stream.on("data", (obj: any) => {
        if (obj?.name && obj.lastModified && new Date(obj.lastModified).getTime() < cutoff) queue.push({ name: obj.name });
        if (queue.length >= 300) stream.destroy();
      });
      const finish = async () => {
        for (const o of queue) {
          if (inspected++ > 600) break;
          try {
            if (!(await isKeyInUse(o.name))) {
              await deleteFromMinio(o.name);
              removed++;
            }
          } catch (_) {
            // keep the file when in doubt
          }
        }
        resolve();
      };
      stream.on("close", () => void finish());
      stream.on("error", () => resolve());
    });
  }
  return removed;
};

export const startMaintenanceJobs = () => {
  // Every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    void withLock("auto-complete", 240, autoCompleteDueJobs);
    void withLock("expire-offers", 240, expireStaleOffers);
    void withLock("reminders", 240, sendUpcomingReminders);
  }, options);

  // Every 10 minutes
  cron.schedule("*/10 * * * *", () => {
    void withLock("expire-open-jobs", 540, expireStaleOpenJobs);
    void withLock("reconcile-payouts", 540, reconcileOnlinePayouts);
    void withLock("ledger-watch", 540, watchUnconfirmedLedger);
  }, options);

  // Hourly
  cron.schedule("7 * * * *", () => {
    void withLock("expire-unpaid-jobs", 3000, expireUnpaidJobs);
    void withLock("stuck-offers", 3000, () => ChatRepository.expireStuckAwaitingPayment(24));
    void withLock("stuck-payments", 3000, async () => (await PaymentRepository.expireStuckPendings(24)).modifiedCount);
    void withLock("abandoned-signups", 3000, removeAbandonedSignups);
  }, options);

  // Nightly
  cron.schedule("30 3 * * *", () => {
    void withLock("orphan-uploads", 3 * 3600, removeOrphanUploads);
  }, options);

  logger.info(`[CRON] maintenance jobs scheduled (${BUSINESS_TZ})`);
};
