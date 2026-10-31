import z from "zod";
import { refineTimeRange } from "../../util/hourly";
import { refineInServiceArea } from "../../util/validators";

// ─── ObjectId param validator ──────────────────────────
const objectIdParam = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const MAX_OFFER_PRICE = 100_000;

// ─── Create or Get Conversation ────────────────────────
const createConversationDto = z.object({
  body: z
    .object({
      participantId: objectIdParam,
    })
    .strict(),
});

const messageFields = {
  type: z.enum(["text", "image", "video"]),
  content: z.string().trim().max(5000).optional(),
  images: z.array(z.string().max(500)).max(4).optional(),
  video: z.string().max(500).optional(),
};

const refineMessage = (
  data: { type: string; content?: string; images?: string[]; video?: string },
  ctx: z.RefinementCtx,
) => {
  if (data.type === "text" && !data.content) {
    ctx.addIssue({ code: "custom", message: "Text message requires content", path: ["content"] });
  }
  if (data.type === "image" && !(data.images && data.images.length > 0)) {
    ctx.addIssue({ code: "custom", message: "Image message requires at least one image", path: ["images"] });
  }
  if (data.type === "video" && !data.video) {
    ctx.addIssue({ code: "custom", message: "Video message requires a video", path: ["video"] });
  }
};

// ─── Send Message with conversationId param ───────────
const sendMessageWithParamsDto = z.object({
  params: z.object({
    conversationId: objectIdParam,
  }),
  body: z.object(messageFields).strict().superRefine(refineMessage),
});

/** Same rules for the socket path (`chat:send`), so it cannot be used to bypass validation. */
export const socketSendMessageSchema = z
  .object({ conversationId: objectIdParam, ...messageFields })
  .strict()
  .superRefine(refineMessage);

export const socketReadSchema = z
  .object({
    conversationId: objectIdParam,
    messageIds: z.array(objectIdParam).min(1).max(100),
  })
  .strict();

export const socketConversationSchema = z.object({ conversationId: objectIdParam });

// ─── Offers ────────────────────────────────────────────
const offerBodyFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  price: z.number().positive("Price must be greater than 0").max(MAX_OFFER_PRICE),
  priceType: z.enum(["fixed", "hourly"]).default("fixed"),
  date: z.string().trim().min(1, "Date is required").max(40).regex(ISO_DAY, "Date must look like 2026-01-31"),
  startTime: z.string().trim().max(20).optional(),
  endTime: z.string().trim().max(20).optional(),
  address: z.string().trim().min(1, "Work location is required").max(500),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  paymentMethod: z.enum(["cash", "online"]).default("cash"),
  images: z.array(z.string().max(500)).max(4).optional(),
};

const hourlyNeedsTimes = (
  data: { priceType?: string; startTime?: string; endTime?: string },
  ctx: z.RefinementCtx,
) => {
  if (data.priceType === "hourly" && (!data.startTime || !data.endTime)) {
    ctx.addIssue({
      code: "custom",
      message: "Start and end time are required for an hourly price",
      path: ["startTime"],
    });
  }
};

// ─── Send Offer with conversationId param ─────────────
const sendOfferWithParamsDto = z.object({
  params: z.object({
    conversationId: objectIdParam,
  }),
  body: z
    .object(offerBodyFields)
    .strict()
    .superRefine(refineTimeRange)
    .superRefine(hourlyNeedsTimes)
    .superRefine(refineInServiceArea),
});

// ─── Edit Offer (params + body) ───────────────────────
const editOfferDto = z.object({
  params: z.object({
    conversationId: objectIdParam,
    offerId: objectIdParam,
  }),
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).optional(),
      price: z.number().positive().max(MAX_OFFER_PRICE).optional(),
      priceType: z.enum(["fixed", "hourly"]).optional(),
      date: z.string().trim().max(40).regex(ISO_DAY, "Date must look like 2026-01-31").optional(),
      startTime: z.string().trim().max(20).optional(),
      endTime: z.string().trim().max(20).optional(),
      address: z.string().trim().min(1).max(500).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      paymentMethod: z.enum(["cash", "online"]).optional(),
      images: z.array(z.string().max(500)).max(4).optional(),
    })
    .strict()
    .superRefine(refineInServiceArea),
});

// ─── Offer actions ─────────────────────────────────────
const offerActionParamsDto = z.object({
  params: z.object({
    conversationId: objectIdParam,
    offerId: objectIdParam,
  }),
});

/** The client accepts the exact version they were looking at. */
const acceptOfferDto = z.object({
  params: z.object({
    conversationId: objectIdParam,
    offerId: objectIdParam,
  }),
  body: z
    .object({
      version: z.number().int().min(1, "Offer version is required"),
    })
    .strict(),
});

// ─── Mark Read ─────────────────────────────────────────
const markReadDto = z.object({
  body: z
    .object({
      messageIds: z.array(objectIdParam).min(1, "At least one message ID required").max(100),
    })
    .strict(),
});

// ─── Message Query (pagination) ────────────────────────
// `before` is a message id (preferred) or an ISO date; `page` is accepted for
// older apps but ignored — paging is cursor based.
const messageQueryDto = z.object({
  query: z
    .object({
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(50).optional(),
      before: z.string().max(40).optional(),
    })
    .strict(),
});

const conversationListQueryDto = z.object({
  query: z
    .object({
      limit: z.coerce.number().int().positive().max(100).optional(),
      before: z.string().max(40).optional(),
    })
    .strict(),
});

const conversationParamsDto = z.object({
  params: z.object({ conversationId: objectIdParam }),
});

const reportConversationDto = z.object({
  params: z.object({ conversationId: objectIdParam }),
  body: z
    .object({
      reason: z.enum(["spam", "harassment", "fraud", "inappropriate", "other"]),
      message: z.string().trim().max(1000).optional(),
    })
    .strict(),
});

const presenceQueryDto = z.object({
  query: z.object({
    ids: z
      .string()
      .max(2000)
      .regex(/^[0-9a-fA-F]{24}(,[0-9a-fA-F]{24})*$/, "ids must be a comma separated list of user ids"),
  }),
});

export const ChatDto = {
  createConversation: createConversationDto,
  sendMessageWithParams: sendMessageWithParamsDto,
  sendOfferWithParams: sendOfferWithParamsDto,
  editOffer: editOfferDto,
  acceptOffer: acceptOfferDto,
  markRead: markReadDto,
  messageQuery: messageQueryDto,
  conversationListQuery: conversationListQueryDto,
  conversationParams: conversationParamsDto,
  reportConversation: reportConversationDto,
  presenceQuery: presenceQueryDto,
  offerActionParams: offerActionParamsDto,
};
