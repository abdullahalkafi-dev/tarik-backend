jest.mock("../../src/util/notifyUser", () => ({
  notifyUser: jest.fn().mockResolvedValue(undefined),
  notifyUserT: jest.fn().mockResolvedValue(undefined),
  notifyManyT: jest.fn().mockResolvedValue(undefined),
  textFor: jest.fn().mockReturnValue({ title: "", body: "Sent a photo" }),
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

import { ChatService, expireStaleOffers } from "../../src/module/chat/chat.service";
import { JobService } from "../../src/module/job/job.service";
import { Conversation } from "../../src/module/chat/conversation.model";
import { Message } from "../../src/module/chat/message.model";
import { Job } from "../../src/module/job/job.model";
import { User } from "../../src/module/user/user.model";
import { WalletTransactionLedger } from "../../src/module/wallet/walletTransaction.model";
import { balanceOf, createCategory, createClient, createHelper, tomorrow, CASABLANCA } from "../helpers/factory";

let category: any;

const offerPayload = (extra: Record<string, unknown> = {}) => ({
  title: "Deep cleaning",
  price: 500,
  priceType: "fixed" as const,
  date: tomorrow(),
  startTime: "9:00 AM",
  endTime: "2:00 PM",
  address: "12 Rue Test, Maarif, Casablanca",
  longitude: CASABLANCA.lon,
  latitude: CASABLANCA.lat,
  paymentMethod: "cash" as const,
  ...extra,
});

const setup = async (balance = 1000) => {
  const client = await createClient();
  const helper = await createHelper(category._id, { balance });
  // a client opens the conversation from the helper's profile
  const conv: any = await ChatService.createOrGetConversation(client.id, helper.id);
  return { client, helper, conversationId: String(conv._id) };
};

beforeAll(async () => {
  await Promise.all([User.init(), Job.init(), Conversation.init(), Message.init(), WalletTransactionLedger.init()]);
});

beforeEach(async () => {
  category = await createCategory("Home Cleaning");
});

describe("who may start a conversation (CH-05)", () => {
  it("client -> approved helper works, and a second call returns the same conversation", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id);
    const a: any = await ChatService.createOrGetConversation(client.id, helper.id);
    const b: any = await ChatService.createOrGetConversation(client.id, helper.id);
    expect(String(a._id)).toBe(String(b._id));
    expect(await Conversation.countDocuments({})).toBe(1);
  });

  it("client -> client and helper -> helper are refused", async () => {
    const c1 = await createClient();
    const c2 = await createClient("Other");
    const h1 = await createHelper(category._id);
    const h2 = await createHelper(category._id, { name: "Helper Two" });
    await expect(ChatService.createOrGetConversation(c1.id, c2.id)).rejects.toMatchObject({ code: "CHAT_NOT_ALLOWED" });
    await expect(ChatService.createOrGetConversation(h1.id, h2.id)).rejects.toMatchObject({ code: "CHAT_NOT_ALLOWED" });
  });

  it("a helper can only write first to a client who posted a job", async () => {
    const client = await createClient();
    const helper = await createHelper(category._id);
    await expect(ChatService.createOrGetConversation(helper.id, client.id)).rejects.toMatchObject({
      code: "CHAT_NOT_ALLOWED",
    });
    await JobService.createJob(client.id, {
      title: "Clean",
      date: tomorrow(),
      budget: 300,
      budgetType: "fixed",
      paymentMethod: "cash",
      address: "Maarif, Casablanca",
      longitude: CASABLANCA.lon,
      latitude: CASABLANCA.lat,
      category: String(category._id),
    } as any);
    await expect(ChatService.createOrGetConversation(helper.id, client.id)).resolves.toBeDefined();
  });
});

describe("messages", () => {
  it("hides phone numbers until a job links the two people (commission protection)", async () => {
    const { client, helper, conversationId } = await setup();
    const msg: any = await ChatService.sendMessage(conversationId, client.id, { type: "text", content: "call me 0612345678" });
    expect(msg.content).not.toContain("0612345678");
    expect(msg.masked).toBe(true);

    const plain: any = await ChatService.sendMessage(conversationId, helper.id, { type: "text", content: "I can be there at 5 pm" });
    expect(plain.content).toBe("I can be there at 5 pm");
    expect(plain.masked).toBe(false);
  });

  it("only the sender's own uploads can be attached (CH-08)", async () => {
    const { client, conversationId } = await setup();
    await expect(
      ChatService.sendMessage(conversationId, client.id, { type: "image", images: ["https://evil.example/x.png"] }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      ChatService.sendMessage(conversationId, client.id, {
        type: "image",
        images: ["images/507f1f77bcf86cd799439011/a.webp"],
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    const ok: any = await ChatService.sendMessage(conversationId, client.id, {
      type: "image",
      images: [`images/${client.id}/mine.webp`],
    });
    expect(ok.images).toHaveLength(1);
  });

  it("a blocked conversation accepts no messages", async () => {
    const { client, helper, conversationId } = await setup();
    await ChatService.setBlocked(conversationId, helper.id, true);
    await expect(
      ChatService.sendMessage(conversationId, client.id, { type: "text", content: "hello" }),
    ).rejects.toMatchObject({ code: "CONVERSATION_BLOCKED" });
    await ChatService.setBlocked(conversationId, helper.id, false);
    await expect(ChatService.sendMessage(conversationId, client.id, { type: "text", content: "hello" })).resolves.toBeDefined();
  });

  it("reading a page marks only that page as read; the badge shows the real remainder (CH-07)", async () => {
    const { client, helper, conversationId } = await setup();
    for (let i = 0; i < 5; i++) {
      await ChatService.sendMessage(conversationId, client.id, { type: "text", content: `m${i}` });
    }
    const first: any = await ChatService.getMessages(conversationId, helper.id, { limit: 2 });
    expect(first.docs).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const list: any[] = await ChatService.listConversations(helper.id);
    expect(list[0].unreadCount).toBe(3);

    const older: any = await ChatService.getMessages(conversationId, helper.id, { limit: 10, before: first.nextBefore });
    expect(older.docs).toHaveLength(3);
    expect(older.hasMore).toBe(false);
    expect(((await ChatService.listConversations(helper.id)) as any[])[0].unreadCount).toBe(0);
    expect((await ChatService.getUnreadTotal(helper.id)).unread).toBe(0);
  });
});

describe("offers: money and trust (CH-01..04, CH-12)", () => {
  it("a cash offer holds the commission; rejecting gives it back exactly once", async () => {
    const { client, helper, conversationId } = await setup(1000);
    const offer: any = await ChatService.sendOffer(conversationId, helper.id, offerPayload());
    expect(offer.offerData.commissionDeducted).toBe(100);
    expect(offer.offerData.totalAmount).toBe(500);
    expect(offer.offerData.version).toBe(1);
    expect(await balanceOf(helper.id)).toBe(900);

    await ChatService.rejectOffer(conversationId, client.id, String(offer._id));
    expect(await balanceOf(helper.id)).toBe(1000);
    await expect(ChatService.rejectOffer(conversationId, client.id, String(offer._id))).rejects.toMatchObject({
      code: "OFFER_NOT_PENDING",
    });
    expect(await balanceOf(helper.id)).toBe(1000);
  });

  it("the client must accept the version they saw; an edit invalidates it (CH-03)", async () => {
    const { client, helper, conversationId } = await setup(1000);
    const offer: any = await ChatService.sendOffer(conversationId, helper.id, offerPayload());
    const id = String(offer._id);

    // price goes up after the client opened the offer
    const edited: any = await ChatService.editOffer(conversationId, helper.id, id, { price: 600 });
    expect(edited.offerData.version).toBe(2);
    expect(edited.offerData.commissionDeducted).toBe(120);
    expect(await balanceOf(helper.id)).toBe(880);

    await expect(ChatService.acceptOffer(conversationId, client.id, id, 1)).rejects.toMatchObject({ code: "OFFER_CHANGED" });

    const accepted: any = await ChatService.acceptOffer(conversationId, client.id, id, 2);
    expect(accepted.status).toBe("accepted");
    const job: any = await Job.findById(accepted.jobId).lean();
    expect(job.status).toBe("in_progress");
    expect(job.budget).toBe(600);
    expect(job.commissionDeducted).toBe(120);
    expect(job.feePercentage).toBe(20);
    expect(job.assignedTo.toString()).toBe(helper.id);
    expect(await balanceOf(helper.id)).toBe(880); // no second deduction on accept
  });

  it("lowering the price returns the difference", async () => {
    const { helper, conversationId } = await setup(1000);
    const offer: any = await ChatService.sendOffer(conversationId, helper.id, offerPayload());
    await ChatService.editOffer(conversationId, helper.id, String(offer._id), { price: 300 });
    expect(await balanceOf(helper.id)).toBe(940); // commission 60 held
    const msg: any = await Message.findById(offer._id).lean();
    expect(msg.offerData.commissionDeducted).toBe(60);
  });

  it("cancelling by the helper releases the held commission", async () => {
    const { helper, conversationId } = await setup(1000);
    const offer: any = await ChatService.sendOffer(conversationId, helper.id, offerPayload());
    await ChatService.cancelOffer(conversationId, helper.id, String(offer._id));
    expect(await balanceOf(helper.id)).toBe(1000);
  });

  it("an unanswered offer expires and the commission comes back (CH-01)", async () => {
    const { helper, conversationId } = await setup(1000);
    const offer: any = await ChatService.sendOffer(conversationId, helper.id, offerPayload());
    await Message.updateOne({ _id: offer._id }, { $set: { "offerData.expiresAt": new Date(Date.now() - 1000) } });

    expect(await expireStaleOffers()).toBe(1);
    expect(await balanceOf(helper.id)).toBe(1000);
    expect(((await Message.findById(offer._id).lean()) as any).offerData.status).toBe("expired");
    expect(await expireStaleOffers()).toBe(0);
  });

  it("an expired offer cannot be accepted", async () => {
    const { client, helper, conversationId } = await setup(1000);
    const offer: any = await ChatService.sendOffer(conversationId, helper.id, offerPayload());
    await Message.updateOne({ _id: offer._id }, { $set: { "offerData.expiresAt": new Date(Date.now() - 1000) } });
    await expect(ChatService.acceptOffer(conversationId, client.id, String(offer._id), 1)).rejects.toMatchObject({
      code: "OFFER_EXPIRED",
    });
    expect(await balanceOf(helper.id)).toBe(1000);
  });

  it("an unapproved account cannot send offers, nor can an offer go to a helper (CH-02)", async () => {
    const client = await createClient();
    const pending = await createHelper(category._id, { approved: false, balance: 1000 });
    const approved = await createHelper(category._id, { balance: 1000, name: "Approved" });
    const convPending: any = await Conversation.create({ participants: [client.id, pending.id] });
    await expect(ChatService.sendOffer(String(convPending._id), pending.id, offerPayload())).rejects.toMatchObject({
      code: "NOT_APPROVED",
    });

    const other = await createHelper(category._id, { balance: 1000, name: "Other helper" });
    const convHelpers: any = await Conversation.create({ participants: [approved.id, other.id] });
    await expect(ChatService.sendOffer(String(convHelpers._id), approved.id, offerPayload())).rejects.toMatchObject({
      code: "RECEIVER_NOT_CLIENT",
    });
  });

  it("offers obey the same minimum amount and hourly rules as jobs (CH-04, CH-12)", async () => {
    const { helper, conversationId } = await setup(1000);
    await expect(ChatService.sendOffer(conversationId, helper.id, offerPayload({ price: 5 }))).rejects.toMatchObject({
      code: "MIN_BUDGET",
    });
    await expect(
      ChatService.sendOffer(conversationId, helper.id, offerPayload({ priceType: "hourly", price: 20 })),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      ChatService.sendOffer(conversationId, helper.id, offerPayload({ date: "2020-01-01" })),
    ).rejects.toMatchObject({ code: "START_IN_PAST" });
    await expect(
      ChatService.sendOffer(conversationId, helper.id, offerPayload({ priceType: "hourly", startTime: undefined, endTime: undefined })),
    ).rejects.toMatchObject({ code: "HOURS_REQUIRED" });
    expect(await balanceOf(helper.id)).toBe(1000);
  });

  it("an hourly offer is priced rate x hours on the server", async () => {
    const { helper, conversationId } = await setup(1000);
    const offer: any = await ChatService.sendOffer(
      conversationId,
      helper.id,
      offerPayload({ priceType: "hourly", price: 100 }),
    );
    expect(offer.offerData.totalAmount).toBe(500);
    expect(offer.offerData.hours).toBe(5);
    expect(offer.offerData.commissionDeducted).toBe(100);
  });

  it("a helper cannot lock the whole balance in endless open offers", async () => {
    const { helper, conversationId } = await setup(5000);
    for (let i = 0; i < 5; i++) {
      await ChatService.sendOffer(conversationId, helper.id, offerPayload({ title: `Offer ${i}` }));
    }
    await expect(ChatService.sendOffer(conversationId, helper.id, offerPayload({ title: "One too many" }))).rejects.toMatchObject({
      code: "TOO_MANY_OPEN_OFFERS",
    });
  });

  it("two clicks on Accept create one job", async () => {
    const { client, helper, conversationId } = await setup(1000);
    const offer: any = await ChatService.sendOffer(conversationId, helper.id, offerPayload());
    const results = await Promise.allSettled([
      ChatService.acceptOffer(conversationId, client.id, String(offer._id), 1),
      ChatService.acceptOffer(conversationId, client.id, String(offer._id), 1),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await Job.countDocuments({ isCustomOffer: true })).toBe(1);
  });
});
