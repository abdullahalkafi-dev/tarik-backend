import z from "zod";

const createTicketDto = z.object({
  body: z
    .object({
      subject: z.string().trim().min(3, "Subject is required"),
      message: z.string().trim().min(1, "Message is required"),
    })
    .strict(),
});

const sendMessageDto = z
  .object({
    body: z
      .object({
        content: z.string().trim().optional(),
        attachments: z.array(z.string()).max(5).optional(),
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

export const SupportDto = {
  createTicket: createTicketDto,
  sendMessage: sendMessageDto,
  updateStatus: updateStatusDto,
};
