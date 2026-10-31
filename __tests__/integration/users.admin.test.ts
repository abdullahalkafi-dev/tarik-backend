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

import { UserService } from "../../src/module/user/user.service";
import { AdminService } from "../../src/module/admin/admin.service";
import { ReviewService } from "../../src/module/review/review.service";
import { JobService } from "../../src/module/job/job.service";
import { JobRepository } from "../../src/module/job/job.repository";
import { Job } from "../../src/module/job/job.model";
import { User } from "../../src/module/user/user.model";
import { Auth } from "../../src/module/auth/auth.model";
import { Review } from "../../src/module/review/review.model";
import { Session } from "../../src/module/auth/session.model";
import { WalletRepository } from "../../src/module/wallet/wallet.repository";
import { balanceOf, createCategory, createClient, createHelper, tomorrow, CASABLANCA } from "../helpers/factory";

let category: any;

const jobPayload = (extra: Record<string, unknown> = {}) => ({
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
  category: String(category._id),
  ...extra,
});

const completedJob = async (extra: Record<string, unknown> = {}) => {
  const client = await createClient();
  const helper = await createHelper(category._id, { balance: 300 });
  const job: any = await JobService.createJob(client.id, jobPayload(extra) as any);
  await JobService.acceptJob(helper.id, String(job._id));
  await JobService.completeJob(client.id, String(job._id));
  return { client, helper, jobId: String(job._id) };
};

beforeAll(async () => {
  await Promise.all([User.init(), Job.init(), Review.init(), Auth.init()]);
});

beforeEach(async () => {
  category = await createCategory("Home Cleaning");
});

describe("profile rules (US-04, US-05, US-06, AU-07)", () => {
  it("an approved helper cannot change the verified name or trade; harmless fields are fine", async () => {
    const helper = await createHelper(category._id);
    await expect(UserService.updateProfile(helper.id, { name: "Someone Else" })).rejects.toMatchObject({
      code: "PROFILE_FIELD_LOCKED",
    });
    const other = await createCategory("Gardening & Plant Care");
    await expect(UserService.updateProfile(helper.id, { serviceType: String(other._id) })).rejects.toMatchObject({
      code: "PROFILE_FIELD_LOCKED",
    });
    const ok: any = await UserService.updateProfile(helper.id, { bio: "Careful and on time", pricePerHour: 120 });
    expect(ok.bio).toBe("Careful and on time");
    expect(ok.pricePerHour).toBe(120);
    expect(ok.adminActionHistory).toBeUndefined();
  });

  it("another user's file cannot become my avatar", async () => {
    const me = await createClient();
    const other = await createClient("Other");
    await expect(
      UserService.updateProfile(me.id, { avatar: `images/${other.id}/photo.webp` }),
    ).rejects.toMatchObject({ statusCode: 403 });
    const ok: any = await UserService.updateProfile(me.id, { avatar: `images/${me.id}/photo.webp` });
    expect(ok.avatar).toBe(`http://files/images/${me.id}/photo.webp`);
  });

  it("e-mail is stored in lower case and cannot belong to two accounts", async () => {
    const a = await createClient("A");
    const b = await createClient("B");
    await UserService.updateProfile(a.id, { email: "Shared@Example.com" });
    expect((await User.findById(a.id))!.email).toBe("shared@example.com");
    await expect(UserService.updateProfile(b.id, { email: "shared@example.COM" })).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
    });
  });

  it("re-applying after a rejection moves to pending with ONE history row; saving again adds none", async () => {
    const client = await createClient();
    await User.updateOne({ _id: client.id }, { $set: { helperApplicationStatus: "rejected", isHelperFormSubmitted: true } });
    const payload = {
      age: 28,
      city: "Casablanca",
      language: "Arabic, French",
      serviceType: String(category._id),
      pricePerHour: 90,
      experience: 2,
      serviceRadius: 15,
    };
    await UserService.helperApply(client.id, payload);
    await UserService.helperApply(client.id, { ...payload, pricePerHour: 95 });
    const u: any = await User.findById(client.id).lean();
    expect(u.helperApplicationStatus).toBe("pending");
    expect(u.applicationHistory).toHaveLength(1);
    expect(u.pricePerHour).toBe(95);
  });

  it("an application under appeal cannot be edited; only a rejected one can be appealed", async () => {
    const client = await createClient();
    await expect(UserService.submitAppeal(client.id, "please check again")).rejects.toMatchObject({
      code: "APPEAL_NOT_ALLOWED",
    });
    await User.updateOne({ _id: client.id }, { $set: { helperApplicationStatus: "rejected", isHelperFormSubmitted: true } });
    await UserService.submitAppeal(client.id, "please check again");
    expect((await User.findById(client.id))!.helperApplicationStatus).toBe("pending_appeal");
    await expect(
      UserService.helperApply(client.id, {
        age: 28,
        city: "Casablanca",
        language: "Arabic",
        serviceType: String(category._id),
        pricePerHour: 90,
        experience: 2,
        serviceRadius: 15,
      }),
    ).rejects.toMatchObject({ code: "APPLICATION_LOCKED" });
  });

  it("only approved helpers can go off duty", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id);
    await expect(UserService.setAvailability(client.id, false)).rejects.toMatchObject({ code: "NOT_A_HELPER" });
    await UserService.setAvailability(helper.id, false);
    expect((await User.findById(helper.id))!.isAvailable).toBe(false);
  });

  it("several devices can receive pushes; logging out removes only that device (US-12)", async () => {
    const helper = await createHelper(category._id);
    await UserService.registerDeviceToken(helper.id, { token: "phone-token", platform: "android", locale: "ar" });
    await UserService.registerDeviceToken(helper.id, { token: "tablet-token", platform: "ios" });
    let u: any = await User.findById(helper.id).lean();
    expect(u.deviceTokens.map((d: any) => d.token).sort()).toEqual(["phone-token", "tablet-token"]);
    expect(u.locale).toBe("ar");

    await UserService.clearDeviceToken(helper.id, "phone-token");
    u = await User.findById(helper.id).lean();
    expect(u.deviceTokens.map((d: any) => d.token)).toEqual(["tablet-token"]);

    // the same token moves to the new account when the phone is handed over
    const other = await createClient("Other");
    await UserService.registerDeviceToken(other.id, { token: "tablet-token" });
    u = await User.findById(helper.id).lean();
    expect(u.deviceTokens).toHaveLength(0);
  });
});

describe("finding helpers (US-01, US-02, US-03)", () => {
  it("returns nearby helpers with a distance and no home address or coordinates", async () => {
    const helper = await createHelper(category._id, { name: "Karim" });
    await User.updateOne({ _id: helper.id }, { $set: { address: "7 Rue Secret, Gauthier, Casablanca" } });
    const res: any = await UserService.searchHelpers({ latitude: CASABLANCA.lat, longitude: CASABLANCA.lon });
    expect(res.helpers).toHaveLength(1);
    const card = res.helpers[0];
    expect(card.distanceKm).toBeDefined();
    expect(JSON.stringify(card)).not.toContain("Rue Secret");
    expect(card.location).toBeUndefined();
    expect(card.area).toBe("Casablanca");
  });

  it("nobody nearby means an empty list and a hint, never helpers from another city (US-01)", async () => {
    await createHelper(category._id, { lat: 31.6295, lon: -7.9811 }); // Marrakech
    const res: any = await UserService.searchHelpers({ latitude: CASABLANCA.lat, longitude: CASABLANCA.lon });
    expect(res.helpers).toHaveLength(0);
    expect(res.total).toBe(0);
    expect(res.expandRadiusSuggested).toBe(true);
  });

  it("respects the helper's own radius, availability and approval", async () => {
    await createHelper(category._id, { name: "Far but wide", lat: 33.65, lon: -7.6, radius: 30 }); // ~9 km away
    await createHelper(category._id, { name: "Far and narrow", lat: 33.65, lon: -7.6, radius: 2 });
    await createHelper(category._id, { name: "Off duty", available: false });
    await createHelper(category._id, { name: "Pending", approved: false });
    const res: any = await UserService.searchHelpers({
      latitude: CASABLANCA.lat,
      longitude: CASABLANCA.lon,
      maxDistance: 20000,
    });
    expect(res.helpers.map((h: any) => h.name)).toEqual(["Far but wide"]);
  });

  it("filters by rating and price and sorts (US-03)", async () => {
    const a = await createHelper(category._id, { name: "A" });
    const b = await createHelper(category._id, { name: "B" });
    await User.updateOne({ _id: a.id }, { $set: { rating: 4.9, pricePerHour: 150 } });
    await User.updateOne({ _id: b.id }, { $set: { rating: 3.2, pricePerHour: 60 } });
    const base = { latitude: CASABLANCA.lat, longitude: CASABLANCA.lon };
    expect(((await UserService.searchHelpers({ ...base, minRating: 4 })) as any).helpers.map((h: any) => h.name)).toEqual(["A"]);
    expect(((await UserService.searchHelpers({ ...base, maxPrice: 100 })) as any).helpers.map((h: any) => h.name)).toEqual(["B"]);
    expect(((await UserService.searchHelpers({ ...base, sort: "price_low" })) as any).helpers.map((h: any) => h.name)).toEqual(["B", "A"]);
    expect(((await UserService.searchHelpers({ ...base, sort: "rating" })) as any).helpers.map((h: any) => h.name)).toEqual(["A", "B"]);
  });

  it("paging is capped at 50", async () => {
    const res: any = await UserService.searchHelpers({ latitude: CASABLANCA.lat, longitude: CASABLANCA.lon, limit: 100000 });
    expect(res.limit).toBe(50);
  });
});

describe("deleting an account (AU-11)", () => {
  it("is blocked while a job is running or money is left, otherwise anonymises and frees the phone", async () => {
    const client = await createClient("Leaving Client");
    const helper = await createHelper(category._id, { balance: 300 });
    const job: any = await JobService.createJob(client.id, jobPayload() as any);
    await JobService.acceptJob(helper.id, String(job._id));
    await expect(UserService.deleteAccount(client.id, "Password1!")).rejects.toMatchObject({ code: "ACTIVE_JOBS" });
    await expect(UserService.deleteAccount(client.id, "wrong")).rejects.toMatchObject({ code: "WRONG_PASSWORD" });

    await JobService.cancelJob(client.id, String(job._id), "Changed my mind");
    const phone = (client.user as any).phone;
    await UserService.deleteAccount(client.id, "Password1!");

    const u: any = await User.findById(client.id).lean();
    expect(u.isDeleted).toBe(true);
    expect(u.name).toBe("Deleted user");
    expect(u.phone).toBeUndefined();
    const a: any = await Auth.findById(client.auth._id).lean();
    expect(a.isDeleted).toBe(true);
    expect(a.phone).toBeUndefined();
    // the number can register again
    const again = await createClient("Same phone");
    expect(again.id).toBeDefined();
    void phone;

    // wallet money must be settled first
    await expect(UserService.deleteAccount(helper.id, "Password1!")).rejects.toMatchObject({ code: "WALLET_NOT_EMPTY" });
  });
});

describe("reviews (RV-01..04)", () => {
  it("the reviewee is always the other party, whatever the request says", async () => {
    const { client, helper, jobId } = await completedJob();
    const stranger = await createClient("Competitor");
    const review: any = await ReviewService.createReview(client.id, {
      jobId,
      revieweeId: stranger.id, // ignored
      rating: 5,
    });
    expect(String(review.reviewee)).toBe(helper.id);
    expect((await User.findById(helper.id))!.rating).toBe(5);
    expect((await User.findById(stranger.id))!.rating ?? 0).toBe(0);
  });

  it("a non-participant cannot review; a duplicate is refused; a low rating needs a reason", async () => {
    const { client, helper, jobId } = await completedJob();
    const stranger = await createClient("Stranger");
    await expect(ReviewService.createReview(stranger.id, { jobId, rating: 1, comment: "terrible service" })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(ReviewService.createReview(client.id, { jobId, rating: 1 })).rejects.toMatchObject({
      code: "COMMENT_REQUIRED",
    });
    await ReviewService.createReview(client.id, { jobId, rating: 4 });
    await expect(ReviewService.createReview(client.id, { jobId, rating: 5 })).rejects.toMatchObject({ statusCode: 409 });
    // the helper rates the client back
    const back: any = await ReviewService.createReview(helper.id, { jobId, rating: 5 });
    expect(String(back.reviewee)).toBe(client.id);
  });

  it("jobs below the minimum amount cannot create ratings (fake 1 MAD jobs)", async () => {
    const { client, jobId } = await completedJob();
    await Job.updateOne({ _id: jobId }, { $set: { budget: 1 } });
    await expect(ReviewService.createReview(client.id, { jobId, rating: 5 })).rejects.toMatchObject({
      code: "JOB_TOO_SMALL",
    });
  });

  it("the same two accounts cannot pump each other's rating", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 3000 });
    for (let i = 0; i < 3; i++) {
      const job: any = await JobService.createJob(client.id, jobPayload({ title: `Job ${i}`, date: tomorrow(), startTime: undefined, endTime: undefined }) as any);
      await JobService.acceptJob(helper.id, String(job._id));
      await JobService.completeJob(client.id, String(job._id));
      await ReviewService.createReview(client.id, { jobId: String(job._id), rating: 5 });
    }
    const job: any = await JobService.createJob(client.id, jobPayload({ title: "Job 4", startTime: undefined, endTime: undefined }) as any);
    await JobService.acceptJob(helper.id, String(job._id));
    await JobService.completeJob(client.id, String(job._id));
    await expect(ReviewService.createReview(client.id, { jobId: String(job._id), rating: 5 })).rejects.toMatchObject({
      code: "REVIEW_PAIR_LIMIT",
    });
  });

  it("edit window, one public reply, short public names", async () => {
    const { client, helper, jobId } = await completedJob();
    const review: any = await ReviewService.createReview(client.id, { jobId, rating: 4, comment: "Good" });

    await ReviewService.editReview(client.id, String(review._id), { rating: 5, comment: "Great work" });
    expect((await User.findById(helper.id))!.rating).toBe(5);
    await Review.collection.updateOne({ _id: review._id }, { $set: { createdAt: new Date(Date.now() - 48 * 3_600_000) } });
    await expect(ReviewService.editReview(client.id, String(review._id), { rating: 1, comment: "changed" })).rejects.toMatchObject({
      code: "EDIT_WINDOW_PASSED",
    });

    await ReviewService.replyToReview(helper.id, String(review._id), "Thank you!");
    await expect(ReviewService.replyToReview(helper.id, String(review._id), "again")).rejects.toMatchObject({
      code: "ALREADY_REPLIED",
    });
    await expect(ReviewService.replyToReview(client.id, String(review._id), "hi")).rejects.toMatchObject({ statusCode: 403 });

    await User.updateOne({ _id: client.id }, { $set: { name: "Ahmed Benali" } });
    const list: any[] = await ReviewService.getUserReviews(helper.id);
    expect(list[0].reviewer.name).toBe("Ahmed B.");
    expect(list[0].reply.text).toBe("Thank you!");
    expect(list[0].job).toBeUndefined();
  });
});

describe("admin actions (AD-02, AD-03, AD-05, AD-07)", () => {
  it("blocking a user cancels their running jobs with refunds and ends their sessions", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const admin = await createClient("Admin Person");
    const job: any = await JobService.createJob(client.id, jobPayload() as any);
    await JobService.acceptJob(helper.id, String(job._id));
    await Session.create({ auth: client.auth._id, expiresAt: new Date(Date.now() + 1e9) });

    await expect(AdminService.blockUser(client.id, admin.id, "x")).resolves.toBeDefined(); // reason length is a DTO rule
    const after: any = await Job.findById(job._id).lean();
    expect(after.status).toBe("cancelled");
    expect(await balanceOf(helper.id)).toBe(300); // commission returned
    expect(await Session.countDocuments({ auth: client.auth._id })).toBe(0);
    expect(((await Auth.findById(client.auth._id).lean()) as any).tokenVersion).toBeGreaterThan(0);

    await expect(AdminService.blockUser(client.id, admin.id, "again")).rejects.toMatchObject({ code: "ALREADY_BLOCKED" });
    await AdminService.unblockUser(client.id, admin.id);
    expect((await User.findById(client.id))!.isBlocked).toBe(false);
  });

  it("staff accounts cannot be blocked through the customer endpoint", async () => {
    const admin = await createClient("Admin Person");
    const staffAuth = await (Auth as any).create({
      email: "s@example.com",
      loginProvider: "email",
      password: "Password1!",
      role: "staff",
      status: "active",
      isEmailVerified: true,
    });
    const staffUser = await (User as any).create({ auth: staffAuth._id, name: "Staffer" });
    await expect(AdminService.blockUser(String(staffUser._id), admin.id, "nope nope")).rejects.toMatchObject({
      code: "STAFF_PROTECTED",
    });
  });

  it("withdrawing an approval needs a reason and waits for running jobs (AD-07)", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id, { balance: 300 });
    const admin = await createClient("Admin Person");
    await expect(AdminService.rejectHelper(helper.id, "", admin.id)).rejects.toMatchObject({ code: "REASON_REQUIRED" });

    const job: any = await JobService.createJob(client.id, jobPayload() as any);
    await JobService.acceptJob(helper.id, String(job._id));
    await expect(AdminService.rejectHelper(helper.id, "Documents were fake", admin.id)).rejects.toMatchObject({
      code: "HAS_ACTIVE_JOBS",
    });

    await JobService.cancelJob(client.id, String(job._id), "cancel first");
    await AdminService.rejectHelper(helper.id, "Documents were fake", admin.id);
    const u: any = await User.findById(helper.id).lean();
    expect(u.helperApplicationStatus).toBe("rejected");
    expect(((await Auth.findById(helper.auth._id).lean()) as any).role).toBe("user");
  });

  it("an application without the helper form cannot be approved", async () => {
    const client = await createClient();
    await expect(AdminService.approveHelper(client.id, client.id)).rejects.toMatchObject({ code: "APPLICATION_INCOMPLETE" });
  });

  it("the dashboard earnings are the commission really kept, not 20% of everything (AD-05)", async () => {
    // cash job 500: helper prepaid 100.  online job 1000: platform keeps 200.
    await completedJob();
    const client = await createClient();
    const helper = await createHelper(category._id);
    const online: any = await JobService.createJob(client.id, jobPayload({ paymentMethod: "online", budget: 1000 }) as any);
    await JobRepository.markPendingPaymentOpen(online._id);
    await JobService.acceptJob(helper.id, String(online._id));
    await JobService.completeJob(client.id, String(online._id));
    // a wallet top-up is not revenue
    await WalletRepository.topup(helper.id, 5000, "topup_test");

    const stats: any = await AdminService.getStats();
    expect(stats.platformEarnings).toBe(300);
    expect(stats.grossVolume).toBe(1500);
    expect(stats.totalUsers).toBe(2); // customers only
    expect(stats.totalHelpers).toBe(2); // approved helpers, not applicants
    expect(stats.activeWorkers).toBe(2);
    expect(stats.trends.earnings === null || typeof stats.trends.earnings === "number").toBe(true);
  });

  it("staff are created with a role preset and must change the temporary password", async () => {
    const created: any = await AdminService.createStaff({
      name: "Agent Smith",
      email: "Agent@Example.com",
      password: "Temp#Pass1",
    });
    expect(created.email).toBe("agent@example.com");
    expect(created.permissions).toContain("support.manage");
    expect(created.permissions).not.toContain("settings.manage");
    expect(created.mustChangePassword).toBe(true);

    await expect(
      AdminService.createStaff({ name: "Bad Perm", email: "bad@example.com", password: "Temp#Pass1", permissions: ["rule.the.world"] }),
    ).rejects.toMatchObject({ code: "UNKNOWN_PERMISSION" });

    const finance: any = await AdminService.createStaff({
      name: "Money Person",
      email: "money@example.com",
      password: "Temp#Pass1",
      rolePreset: "finance",
    });
    expect(finance.permissions).toContain("settings.manage");
  });

  it("suspending a staff member ends their sessions immediately (AD-02)", async () => {
    const created: any = await AdminService.createStaff({ name: "Agent", email: "a2@example.com", password: "Temp#Pass1" });
    const user: any = await User.findById(created._id).lean();
    await Session.create({ auth: user.auth, expiresAt: new Date(Date.now() + 1e9) });
    await AdminService.updateStaff(String(created._id), { status: "suspended" });
    expect(await Session.countDocuments({ auth: user.auth })).toBe(0);
    expect(((await Auth.findById(user.auth).lean()) as any).status).toBe("suspended");
  });

  it("the customer list contains customers only, with booking counts (AD-06)", async () => {
    const client = await createClient("Real Customer");
    await createHelper(category._id, { name: "A Helper" });
    await JobService.createJob(client.id, jobPayload() as any);
    await JobService.createJob(client.id, jobPayload({ title: "Second" }) as any);
    const list: any = await AdminService.listUsers(1, 20);
    expect(list.docs.map((d: any) => d.name)).toEqual(["Real Customer"]);
    expect(list.docs[0].totalBookings).toBe(2);
    const blocked: any = await AdminService.listUsers(1, 20, undefined, "blocked");
    expect(blocked.total).toBe(0);
  });
});
