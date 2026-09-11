import z from "zod";

// ─── ObjectId param validator ──────────────────────────
const objectIdParam = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format");

// ─── Create or Get Conversation ────────────────────────
const createConversationDto = z.object({
  body: z
    .object({
      participantId: z.string().min(1, "Participant ID is required"),
    })
    .strict(),
});

// ─── Send Message (with conditional validation) ────────
const sendMessageDto = z
  .object({
    body: z
      .object({
        type: z.enum(["text", "image", "video"]),
        content: z.string().trim().max(5000).optional(),
        images: z.array(z.string()).max(4).optional(),
        video: z.string().optional(),
      })
      .strict(),
  })
  .refine(
    (data) => {
      if (data.body.type === "text") return !!data.body.content;
      return true;
    },
    { message: "Text message requires content", path: ["body.content"] },
  )
  .refine(
    (data) => {
      if (data.body.type === "image")
        return !!data.body.images && data.body.images.length > 0;
      return true;
    },
    { message: "Image message requires at least one image", path: ["body.images"] },
  )
  .refine(
    (data) => {
      if (data.body.type === "video") return !!data.body.video;
      return true;
    },
    { message: "Video message requires a video", path: ["body.video"] },
  );

// ─── Send Offer ────────────────────────────────────────
const sendOfferDto = z.object({
  body: z
    .object({
      title: z.string().trim().min(1, "Title is required").max(200),
      description: z.string().trim().max(2000).optional(),
      price: z.number().positive("Price must be greater than 0"),
      priceType: z.enum(["fixed", "hourly"]).default("fixed"),
      date: z.string().trim().min(1, "Date is required").max(20),
      startTime: z.string().trim().max(20).optional(),
      endTime: z.string().trim().max(20).optional(),
      address: z.string().trim().min(1, "Work location is required").max(500),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      paymentMethod: z.enum(["cash", "online"]).default("cash"),
      images: z.array(z.string()).max(4).optional(),
    })
    .strict(),
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
      price: z.number().positive().optional(),
      priceType: z.enum(["fixed", "hourly"]).optional(),
      date: z.string().trim().max(20).optional(),
      startTime: z.string().trim().max(20).optional(),
      endTime: z.string().trim().max(20).optional(),
      address: z.string().trim().min(1).max(500).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      paymentMethod: z.enum(["cash", "online"]).optional(),
      images: z.array(z.string()).max(4).optional(),
    })
    .strict(),
});

// ─── Mark Read ─────────────────────────────────────────
const markReadDto = z.object({
  body: z
    .object({
      messageIds: z.array(z.string()).min(1, "At least one message ID required"),
    })
    .strict(),
});

// ─── Message Query (pagination) ────────────────────────
const messageQueryDto = z.object({
  query: z
    .object({
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(50).default(20).optional(),
      before: z.string().optional(),
    })
    .strict(),
});

// ─── Offer Action Params (accept/reject/cancel/edit) ──
const offerActionParamsDto = z.object({
  params: z.object({
    conversationId: objectIdParam,
    offerId: objectIdParam,
  }),
});

// ─── Send Message with conversationId param ───────────
const sendMessageWithParamsDto = z.object({
  params: z.object({
    conversationId: objectIdParam,
  }),
  body: z
    .object({
      type: z.enum(["text", "image", "video"]),
      content: z.string().trim().max(5000).optional(),
      images: z.array(z.string()).max(4).optional(),
      video: z.string().optional(),
    })
    .strict(),
});

// ─── Send Offer with conversationId param ─────────────
// Same body as sendOfferDto — route uses this schema (params + body).
const sendOfferWithParamsDto = z.object({
  params: z.object({
    conversationId: objectIdParam,
  }),
  body: z
    .object({
      title: z.string().trim().min(1, "Title is required").max(200),
      description: z.string().trim().max(2000).optional(),
      price: z.number().positive("Price must be greater than 0"),
      priceType: z.enum(["fixed", "hourly"]).default("fixed"),
      date: z.string().trim().min(1, "Date is required").max(20),
      startTime: z.string().trim().max(20).optional(),
      endTime: z.string().trim().max(20).optional(),
      address: z.string().trim().min(1, "Work location is required").max(500),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      paymentMethod: z.enum(["cash", "online"]).default("cash"),
      images: z.array(z.string()).max(4).optional(),
    })
    .strict(),
});

export const ChatDto = {
  createConversation: createConversationDto,
  sendMessage: sendMessageDto,
  sendMessageWithParams: sendMessageWithParamsDto,
  sendOffer: sendOfferDto,
  sendOfferWithParams: sendOfferWithParamsDto,
  editOffer: editOfferDto,
  markRead: markReadDto,
  messageQuery: messageQueryDto,
  offerActionParams: offerActionParamsDto,
};
