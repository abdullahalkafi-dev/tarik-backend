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
    refundJobPayment: jest.fn().mockResolvedValue({ success: true }),
  },
}));
jest.mock("../../src/module/didit/didit.service", () => ({
  DiditService: { reevaluateAfterProfile: jest.fn().mockResolvedValue(false) },
}));
jest.mock("../../src/util/minio", () => ({
  resolveUrl: (v?: string) => (v ? `http://files/${v}` : null),
  deleteFromMinio: jest.fn().mockResolvedValue(undefined),
}));

import { WalletService } from "../../src/module/wallet/wallet.service";
import { WalletRepository } from "../../src/module/wallet/wallet.repository";
import { WalletTransactionLedger } from "../../src/module/wallet/walletTransaction.model";
import { ReviewService } from "../../src/module/review/review.service";
import { JobService } from "../../src/module/job/job.service";
import { Review } from "../../src/module/review/review.model";
import { Job } from "../../src/module/job/job.model";
import { User } from "../../src/module/user/user.model";
import { createCategory, createClient, createHelper, tomorrow, CASABLANCA } from "../helpers/factory";

let category: any;

beforeAll(async () => {
  await Promise.all([User.init(), Job.init(), Review.init(), WalletTransactionLedger.init()]);
});

beforeEach(async () => {
  category = await createCategory("Home Cleaning");
});

describe("wallet history (type filter, lifetime totals)", () => {
  it("lists only the requested movement type and reports lifetime totals per type", async () => {
    const helper = await createHelper(category._id, { balance: 0 });
    await WalletRepository.topup(helper.id, 100, "topup_a");
    await WalletRepository.topup(helper.id, 50, "topup_b");
    await WalletRepository.creditEarning(helper.id, 200, "job_1");

    const topups = await WalletService.listTransactions(helper.id, 1, 20, "topup");
    expect(topups.total).toBe(2);
    expect(topups.docs.every((d: any) => d.type === "topup")).toBe(true);

    // paging works on the filtered list
    const firstPage = await WalletService.listTransactions(helper.id, 1, 1, "topup");
    expect(firstPage.docs).toHaveLength(1);
    expect(firstPage.total).toBe(2);

    const summary: any = await WalletService.getWalletBalance(helper.id);
    expect(summary.totals.topup).toBe(150);
    expect(summary.totals.earning_payout).toBe(200);
    expect(summary.balance).toBe(350);
  });
});

describe("review reports", () => {
  it("a moderator can keep a reported review: the report is closed and the review stays", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const job: any = await JobService.createJob(client.id, {
      title: "Clean my flat",
      date: tomorrow(),
      startTime: "9:00 AM",
      endTime: "2:00 PM",
      budget: 500,
      budgetType: "fixed",
      paymentMethod: "cash",
      address: "12 Rue Test, Maarif, Casablanca",
      longitude: CASABLANCA.lon,
      latitude: CASABLANCA.lat,
      category: String(category._id),
    } as any);
    await JobService.acceptJob(helper.id, String(job._id));
    await JobService.completeJob(client.id, String(job._id));
    const review: any = await ReviewService.createReview(client.id, {
      jobId: String(job._id),
      rating: 2,
      comment: "Late and not careful",
    });

    await ReviewService.reportReview(helper.id, String(review._id), "This is not true, I arrived on time");
    expect((await Review.findById(review._id))!.reportedAt).toBeTruthy();

    await ReviewService.dismissReport(String(review._id));
    const after: any = await Review.findById(review._id);
    expect(after).toBeTruthy();
    expect(after.reportedAt).toBeUndefined();
    expect(after.reportReason).toBeUndefined();

    await expect(ReviewService.dismissReport("000000000000000000000000")).rejects.toMatchObject({ statusCode: 404 });
  });
});
