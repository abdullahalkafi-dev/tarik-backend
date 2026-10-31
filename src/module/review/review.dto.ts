import z from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");

const createReviewDto = z.object({
  body: z
    .object({
      jobId: objectId.optional(),
      job: objectId.optional(),
      // Older apps still send these; the server ignores them (the reviewee is always the other party).
      revieweeId: z.string().optional(),
      reviewee: z.string().optional(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(1000).optional(),
    })
    .refine((data) => data.jobId || data.job, { message: "Job ID is required" }),
});

const editReviewDto = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      rating: z.number().int().min(1).max(5).optional(),
      comment: z.string().trim().max(1000).optional(),
    })
    .strict(),
});

const replyDto = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ text: z.string().trim().min(2).max(500) }).strict(),
});

const reportDto = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ reason: z.string().trim().min(3).max(300) }).strict(),
});

const listQueryDto = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().max(1000).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    jobId: z.string().optional(),
    revieweeId: z.string().optional(),
    reviewerId: z.string().optional(),
    search: z.string().max(80).optional(),
    reported: z.enum(["true", "false"]).optional(),
  }),
});

export const ReviewDto = {
  createReview: createReviewDto,
  editReview: editReviewDto,
  reply: replyDto,
  report: reportDto,
  listQuery: listQueryDto,
};
