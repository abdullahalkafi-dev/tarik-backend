import mongoose from "mongoose";

jest.mock("../../src/util/notifyUser", () => ({
  notifyUser: jest.fn().mockResolvedValue(undefined),
  notifyUserT: jest.fn().mockResolvedValue(undefined),
  notifyManyT: jest.fn().mockResolvedValue(undefined),
  textFor: jest.fn().mockReturnValue({ title: "", body: "" }),
}));
jest.mock("../../src/util/notifyAdmins", () => ({ notifyAdmins: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/socket/socket.gateway", () => ({
  emitToUser: jest.fn(),
  emitToUsers: jest.fn(),
  emitToConversation: jest.fn(),
  emitPresenceUpdate: jest.fn(),
  disconnectUserSockets: jest.fn(),
  getSocketServer: jest.fn().mockReturnValue(null),
  isUserInConversationRoom: jest.fn().mockResolvedValue(false),
  getUserRoom: (id: string) => `user:${id}`,
  getConversationRoom: (id: string) => `conversation:${id}`,
}));
jest.mock("../../src/module/payment/payment.service", () => ({
  PaymentService: {
    initializePayment: jest.fn().mockResolvedValue({ checkoutUrl: "http://pay", sessionId: "sess_1" }),
    refundJobPayment: jest.fn().mockResolvedValue({ success: true, reference: "rf_1" }),
  },
}));

import { JobService, payoutOnlineJob, autoCompleteDueJobs, expireStaleOpenJobs } from "../../src/module/job/job.service";
import { JobRepository } from "../../src/module/job/job.repository";
import { Job } from "../../src/module/job/job.model";
import { User } from "../../src/module/user/user.model";
import { SettingsService } from "../../src/module/settings/settings.service";
import { WalletTransactionLedger } from "../../src/module/wallet/walletTransaction.model";
import { WalletRepository } from "../../src/module/wallet/wallet.repository";
import { balanceOf, createCategory, createClient, createHelper, tomorrow, CASABLANCA } from "../helpers/factory";

const basePayload = (categoryId: string, extra: Record<string, unknown> = {}) => ({
  title: "Clean my flat",
  date: tomorrow(),
  startTime: "9:00 AM",
  endTime: "2:00 PM",
  budget: 500,
  budgetType: "fixed" as const,
  paymentMethod: "cash" as const,
  address: "12 Rue Test, Maarif, Casablanca",
  longitude: CASABLANCA.lon,
  latitude: CASABLANCA.lat,
  category: categoryId,
  ...extra,
});

let category: any;

beforeAll(async () => {
  await Promise.all([User.init(), Job.init(), WalletTransactionLedger.init()]);
});

beforeEach(async () => {
  category = await createCategory("Home Cleaning");
});

describe("creating a job: the server decides the amount (FJ-01)", () => {
  it("an hourly job is billed rate x hours, not just the rate", async () => {
    const client = await createClient();
    const job: any = await JobService.createJob(
      client.id,
      basePayload(String(category._id), { budgetType: "hourly", budget: 100 }) as any,
    );
    expect(job.budget).toBe(500); // 100 MAD/h x 5 h
    expect(job.hourlyRate).toBe(100);
    expect(job.hours).toBe(5);
    expect(job.status).toBe("open");
    expect(job.startAt).toBeInstanceOf(Date);
  });

  it("an hourly rate below the category minimum is refused", async () => {
    const client = await createClient();
    await expect(
      JobService.createJob(client.id, basePayload(String(category._id), { budgetType: "hourly", budget: 20 }) as any),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("a total below the platform minimum is refused", async () => {
    const client = await createClient();
    await expect(
      JobService.createJob(client.id, basePayload(String(category._id), { budget: 10 }) as any),
    ).rejects.toMatchObject({ code: "MIN_BUDGET" });
  });

  it("a date in the past is refused (JB-09)", async () => {
    const client = await createClient();
    await expect(
      JobService.createJob(
        client.id,
        basePayload(String(category._id), { date: "2020-01-01", startTime: "9:00 AM", endTime: "11:00 AM" }) as any,
      ),
    ).rejects.toMatchObject({ code: "START_IN_PAST" });
  });

  it("an online job waits for payment and is not offered to helpers yet", async () => {
    const client = await createClient();
    const job: any = await JobService.createJob(
      client.id,
      basePayload(String(category._id), { paymentMethod: "online" }) as any,
    );
    expect(job.status).toBe("pending_payment");
    expect(job.checkoutUrl).toBe("http://pay");
  });
});

describe("accepting a cash job", () => {
  it("prepays 20% commission and freezes the fee on the job (JB-13)", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 200 });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);

    const accepted: any = await JobService.acceptJob(helper.id, String(job._id));
    expect(accepted.status).toBe("in_progress");
    expect(accepted.commissionDeducted).toBe(100);
    expect(accepted.feePercentage).toBe(20);
    expect(accepted.helperNet).toBe(400);
    expect(await balanceOf(helper.id)).toBe(100);

    // The fee changes later: this job keeps the fee it was accepted with.
    await SettingsService.updateSettings({ platformFeePercentage: 35 } as any);
    const after: any = await Job.findById(job._id).lean();
    expect(after.feePercentage).toBe(20);
    expect(after.commissionDeducted).toBe(100);
  });

  it("an empty wallet cannot accept, and the job stays open", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 0 });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);

    await expect(JobService.acceptJob(helper.id, String(job._id))).rejects.toMatchObject({
      code: "INSUFFICIENT_BALANCE",
    });
    expect((await Job.findById(job._id))!.status).toBe("open");
    expect(await balanceOf(helper.id)).toBe(0);
  });

  it("two helpers accepting at the same time: one wins, the loser keeps their money", async () => {
    const client = await createClient();
    const h1 = await createHelper(category._id, { balance: 300, name: "H1" });
    const h2 = await createHelper(category._id, { balance: 300, name: "H2" });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);

    const results = await Promise.allSettled([
      JobService.acceptJob(h1.id, String(job._id)),
      JobService.acceptJob(h2.id, String(job._id)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const balances = [await balanceOf(h1.id), await balanceOf(h2.id)].sort();
    expect(balances).toEqual([200, 300]); // winner paid 100, loser untouched
  });

  it("a helper of another trade or far away cannot take the job (JB-08)", async () => {
    const other = await createCategory("Gardening & Plant Care");
    const client = await createClient();
    const wrongTrade = await createHelper(other._id, { balance: 300 });
    const farAway = await createHelper(category._id, { balance: 300, lat: 31.63, lon: -8.0, radius: 20 });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);

    await expect(JobService.acceptJob(wrongTrade.id, String(job._id))).rejects.toMatchObject({ code: "CATEGORY_MISMATCH" });
    await expect(JobService.acceptJob(farAway.id, String(job._id))).rejects.toMatchObject({ code: "OUT_OF_RADIUS" });
    expect((await Job.findById(job._id))!.status).toBe("open");
  });

  it("an off-duty or unapproved helper cannot accept", async () => {
    const client = await createClient();
    const off = await createHelper(category._id, { balance: 300, available: false });
    const pending = await createHelper(category._id, { balance: 300, approved: false });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);

    await expect(JobService.acceptJob(off.id, String(job._id))).rejects.toMatchObject({ code: "OFF_DUTY" });
    await expect(JobService.acceptJob(pending.id, String(job._id))).rejects.toMatchObject({ code: "NOT_APPROVED" });
  });

  it("a helper cannot be booked twice at the same time (JB-08)", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 500 });
    const a: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    const b: any = await JobService.createJob(client.id, basePayload(String(category._id), { title: "Same time" }) as any);

    await JobService.acceptJob(helper.id, String(a._id));
    await expect(JobService.acceptJob(helper.id, String(b._id))).rejects.toMatchObject({ code: "SCHEDULE_CONFLICT" });
  });
});

describe("editing a job (JB-01)", () => {
  it("an open cash job can change its price; the total is recomputed", async () => {
    const client = await createClient();
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    const updated: any = await JobService.updateJob(client.id, String(job._id), { budget: 650 });
    expect(updated.budget).toBe(650);
  });

  it("after a helper accepted, nothing can be edited", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    await JobService.acceptJob(helper.id, String(job._id));

    await expect(JobService.updateJob(client.id, String(job._id), { budget: 1 })).rejects.toMatchObject({
      code: "JOB_NOT_EDITABLE",
    });
  });

  it("a paid online job keeps its price, time and place", async () => {
    const client = await createClient();
    const job: any = await JobService.createJob(
      client.id,
      basePayload(String(category._id), { paymentMethod: "online" }) as any,
    );
    await JobRepository.markPendingPaymentOpen(job._id);
    await expect(JobService.updateJob(client.id, String(job._id), { budget: 40 })).rejects.toMatchObject({
      code: "PAID_JOB_LOCKED",
    });
    // harmless details can still change
    const ok: any = await JobService.updateJob(client.id, String(job._id), { description: "Bring a ladder" });
    expect(ok.description).toBe("Bring a ladder");
  });

  it("only the owner may edit", async () => {
    const client = await createClient();
    const stranger = await createClient("Stranger");
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    await expect(JobService.updateJob(stranger.id, String(job._id), { title: "x" })).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("what each person may see of a job (JB-03)", () => {
  it("a stranger helper sees the public view: no phone, e-mail, exact address or exact position", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);

    const view: any = await JobService.getJobById(String(job._id), { userId: helper.id, role: "helper" });
    const json = JSON.stringify(view);
    expect(view.address).toBe("Maarif, Casablanca");
    expect(json).not.toContain("Rue Test");
    expect(json).not.toContain((client.user as any).phone);
    expect(view.postedBy.phone).toBeUndefined();
    expect(view.postedBy.email).toBeUndefined();
    expect(view.location.coordinates).not.toEqual([CASABLANCA.lon, CASABLANCA.lat]);
    expect(view.locationApproximate).toBe(true);
  });

  it("the owner sees the full job; the assigned helper sees the client's phone only while active", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    await JobService.acceptJob(helper.id, String(job._id));

    const owner: any = await JobService.getJobById(String(job._id), { userId: client.id, role: "user" });
    expect(owner.address).toContain("Rue Test");
    expect(owner.assignedTo.phone).toBe((helper.user as any).phone);
    expect(owner.postedBy.email).toBeUndefined();

    const asHelper: any = await JobService.getJobById(String(job._id), { userId: helper.id, role: "helper" });
    expect(asHelper.address).toContain("Rue Test");
    expect(asHelper.postedBy.phone).toBe((client.user as any).phone);

    await JobService.completeJob(client.id, String(job._id));
    const afterDone: any = await JobService.getJobById(String(job._id), { userId: helper.id, role: "helper" });
    expect(afterDone.postedBy.phone).toBeUndefined();
  });

  it("a stranger cannot open a job that is no longer open", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const stranger = await createHelper(category._id, { balance: 0 });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    await JobService.acceptJob(helper.id, String(job._id));
    await expect(JobService.getJobById(String(job._id), { userId: stranger.id, role: "helper" })).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("nearby jobs are paginated, in the helper's own trade, without private data (JB-12)", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const other = await createCategory("Tutoring & Education");
    for (let i = 0; i < 3; i++) {
      await JobService.createJob(client.id, basePayload(String(category._id), { title: `Job ${i}`, startTime: undefined, endTime: undefined }) as any);
    }
    await JobService.createJob(client.id, basePayload(String(other._id), { title: "Other trade", startTime: undefined, endTime: undefined }) as any);

    const page: any = await JobService.getNearbyJobs(helper.id, { limit: 2, page: 1 });
    expect(page.docs).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.docs.every((d: any) => d.title.startsWith("Job"))).toBe(true);
    expect(JSON.stringify(page)).not.toContain("Rue Test");
    expect(page.docs[0].distanceKm).toBeDefined();
  });
});

describe("finishing and paying (JB-05, JB-06)", () => {
  const onlineJobAccepted = async () => {
    const client = await createClient();
    const helper = await createHelper(category._id);
    const job: any = await JobService.createJob(
      client.id,
      basePayload(String(category._id), { paymentMethod: "online" }) as any,
    );
    await JobRepository.markPendingPaymentOpen(job._id);
    await JobService.acceptJob(helper.id, String(job._id));
    return { client, helper, jobId: String(job._id) };
  };

  it("completing an online job pays the helper the frozen net amount exactly once", async () => {
    const { client, helper, jobId } = await onlineJobAccepted();
    await JobService.completeJob(client.id, jobId);
    expect(await balanceOf(helper.id)).toBe(400);
    expect((await Job.findById(jobId))!.escrowCredited).toBe(true);

    // a retry / the reconciliation job can never pay twice
    await payoutOnlineJob(jobId);
    await payoutOnlineJob(jobId);
    expect(await balanceOf(helper.id)).toBe(400);
    expect(await WalletTransactionLedger.countDocuments({ type: "earning_payout" } as any)).toBe(1);
  });

  it("if crediting fails the job is not marked as paid, and the retry pays it (JB-05)", async () => {
    const { client, helper, jobId } = await onlineJobAccepted();
    const spy = jest.spyOn(WalletRepository, "creditEarning").mockRejectedValueOnce(new Error("db down"));
    await JobService.completeJob(client.id, jobId);
    spy.mockRestore();

    expect((await Job.findById(jobId))!.escrowCredited).toBeFalsy();
    expect(await balanceOf(helper.id)).toBe(0);

    expect(await payoutOnlineJob(jobId)).toBe(true);
    expect(await balanceOf(helper.id)).toBe(400);
  });

  it("the helper can finish; the client's silence completes the job after 48 h", async () => {
    const { helper, jobId } = await onlineJobAccepted();
    await JobService.markOnTheWay(helper.id, jobId);
    await JobService.markArrived(helper.id, jobId);
    const finished: any = await JobService.markFinished(helper.id, jobId);
    expect(finished.helperFinishedAt).toBeInstanceOf(Date);

    expect(await autoCompleteDueJobs()).toBe(0); // not yet due
    await Job.updateOne({ _id: jobId }, { $set: { autoCompleteAt: new Date(Date.now() - 1000) } });
    expect(await autoCompleteDueJobs()).toBe(1);
    expect((await Job.findById(jobId))!.status).toBe("completed");
    expect(await balanceOf(helper.id)).toBe(400);
  });

  it("a reported problem stops the automatic completion (L-04)", async () => {
    const { client, helper, jobId } = await onlineJobAccepted();
    await JobService.markFinished(helper.id, jobId);
    await JobService.resolveDispute(jobId); // no-op baseline
    await Job.updateOne({ _id: jobId }, { $set: { disputeOpen: true, autoCompleteAt: new Date(Date.now() - 1000) } });

    expect(await autoCompleteDueJobs()).toBe(0);
    await expect(JobService.completeJob(client.id, jobId)).rejects.toMatchObject({ code: "DISPUTE_OPEN" });
  });

  it("only the client completes; a stranger cannot", async () => {
    const { helper, jobId } = await onlineJobAccepted();
    await expect(JobService.completeJob(helper.id, jobId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("cash: the helper confirms the cash after completion, once", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    await JobService.acceptJob(helper.id, String(job._id));
    await expect(JobService.confirmCashReceived(helper.id, String(job._id))).rejects.toMatchObject({ statusCode: 400 });
    await JobService.completeJob(client.id, String(job._id));
    await JobService.confirmCashReceived(helper.id, String(job._id));
    await expect(JobService.confirmCashReceived(helper.id, String(job._id))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("cancelling (JB-07)", () => {
  const cashJob = async (startTime = "9:00 AM", endTime = "2:00 PM") => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const job: any = await JobService.createJob(
      client.id,
      basePayload(String(category._id), { startTime, endTime }) as any,
    );
    await JobService.acceptJob(helper.id, String(job._id));
    return { client, helper, jobId: String(job._id) };
  };

  it("the client cancels before the helper arrives: the helper's commission comes back", async () => {
    const { client, helper, jobId } = await cashJob();
    expect(await balanceOf(helper.id)).toBe(200);
    await JobService.cancelJob(client.id, jobId, "Changed my mind", { code: "changed_mind" });
    expect(await balanceOf(helper.id)).toBe(300);
    const job: any = await Job.findById(jobId).lean();
    expect(job.status).toBe("cancelled");
    expect(job.cancelledByRole).toBe("client");
  });

  it("cancelling twice refunds only once", async () => {
    const { client, helper, jobId } = await cashJob();
    await JobService.cancelJob(client.id, jobId, "first");
    await expect(JobService.cancelJob(client.id, jobId, "second")).rejects.toMatchObject({ statusCode: 400 });
    expect(await balanceOf(helper.id)).toBe(300);
  });

  it("a helper cancelling far ahead keeps the commission; cancelling late loses it and gets a strike", async () => {
    const early = await cashJob();
    await JobService.cancelJob(early.helper.id, early.jobId, "Cannot make it");
    expect(await balanceOf(early.helper.id)).toBe(300); // tomorrow is > 3 h away -> refunded

    const late = await cashJob();
    // the job starts in 1 hour and was accepted long ago
    await Job.updateOne(
      { _id: late.jobId },
      { $set: { startAt: new Date(Date.now() + 3_600_000), acceptedAt: new Date(Date.now() - 3 * 3_600_000) } },
    );
    await JobService.cancelJob(late.helper.id, late.jobId, "Too late");
    expect(await balanceOf(late.helper.id)).toBe(200); // commission forfeited
    expect((await User.findById(late.helper.id))!.cancelStrikes).toBe(1);
  });

  it("after the helper arrived, neither side can cancel alone", async () => {
    const { client, helper, jobId } = await cashJob();
    await JobService.markArrived(helper.id, jobId);
    await expect(JobService.cancelJob(client.id, jobId, "no")).rejects.toMatchObject({ code: "NEEDS_SUPPORT" });
    await expect(JobService.cancelJob(helper.id, jobId, "no")).rejects.toMatchObject({ code: "NEEDS_SUPPORT" });
    // support (admin) can still cancel, and the helper is made whole
    await JobService.cancelJob(client.id, jobId, "Resolved by support", { isAdmin: true });
    expect(await balanceOf(helper.id)).toBe(300);
  });

  it("an unpaid-for open online job refunds through the gateway when cancelled", async () => {
    const client = await createClient();
    const job: any = await JobService.createJob(
      client.id,
      basePayload(String(category._id), { paymentMethod: "online" }) as any,
    );
    await JobRepository.markPendingPaymentOpen(job._id);
    const cancelled: any = await JobService.cancelJob(client.id, String(job._id), "No longer needed");
    expect(cancelled.refundStatus).toBe("refunded");
  });

  it("paid online jobs cannot be hard-deleted; unpaid cash jobs can (JB-02)", async () => {
    const client = await createClient();
    const online: any = await JobService.createJob(
      client.id,
      basePayload(String(category._id), { paymentMethod: "online" }) as any,
    );
    await JobRepository.markPendingPaymentOpen(online._id);
    await expect(JobService.deleteJob(client.id, String(online._id))).rejects.toMatchObject({ code: "USE_CANCEL" });

    const cash: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    await JobService.deleteJob(client.id, String(cash._id));
    expect(await Job.findById(cash._id)).toBeNull();
  });
});

describe("expiry (L-06, BE-20)", () => {
  it("an open job whose time passed is cancelled and the client is told", async () => {
    const client = await createClient();
    const job: any = await JobService.createJob(client.id, basePayload(String(category._id)) as any);
    await Job.updateOne({ _id: job._id }, { $set: { startAt: new Date(Date.now() - 3 * 3_600_000) } });

    expect(await expireStaleOpenJobs()).toBe(1);
    const after: any = await Job.findById(job._id).lean();
    expect(after.status).toBe("cancelled");
    expect(after.cancelledByRole).toBe("system");
    expect(after.cancellationCode).toBe("NO_HELPER_FOUND");
  });
});

afterAll(() => {
  // keep the type import used
  void mongoose;
});
