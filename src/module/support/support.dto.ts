import z from "zod";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "./support.interface";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const attachment = z.string().max(500);

const createTicketDto = z.object({
  body: z
    .object({
      subject: z.string().trim().min(3, "Subject is required").max(120),
      message: z.string().trim().min(1, "Message is required").max(4000),
      category: z.enum(TICKET_CATEGORIES).optional(),
      jobId: objectId.optional(),
      reportedUserId: objectId.optional(),
      attachments: z.array(attachment).max(5).optional(),
    })
    .strict(),
});

const sendMessageDto = z
  .object({
    body: z
      .object({
        content: z.string().trim().max(4000).optional(),
        attachments: z.array(attachment).max(5).optional(),
      })
      .strict(),
  })
  .superRefine((data, ctx) => {
    const content = (data.body.content || "").trim();
    const attachments = data.body.attachments || [];
    if (!content && attachments.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Message content or at least one attachment is required",
        path: ["body", "content"],
      });
    }
  });

const updateStatusDto = z.object({
  body: z
    .object({
      status: z.enum(["open", "in_progress", "resolved"]),
    })
    .strict(),
});

const updateTicketDto = z.object({
  body: z
    .object({
      priority: z.enum(TICKET_PRIORITIES).optional(),
      category: z.enum(TICKET_CATEGORIES).optional(),
      assignee: objectId.nullable().optional(),
    })
    .strict(),
});

const addNoteDto = z.object({
  body: z.object({ text: z.string().trim().min(1).max(2000) }).strict(),
});

const adminListQueryDto = z.object({
  query: z.object({
    status: z.enum(["open", "in_progress", "resolved"]).optional(),
    userRole: z.enum(["user", "helper"]).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assignee: z.string().optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().positive().max(1000).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

export const SupportDto = {
  createTicket: createTicketDto,
  sendMessage: sendMessageDto,
  updateStatus: updateStatusDto,
  updateTicket: updateTicketDto,
  addNote: addNoteDto,
  adminList: adminListQueryDto,
};
