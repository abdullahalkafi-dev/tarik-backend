import z from "zod";

const createReviewDto = z.object({
  body: z
    .object({
      jobId: z.string().optional(),
      job: z.string().optional(),
      revieweeId: z.string().optional(),
      reviewee: z.string().optional(),
      rating: z.number().min(1).max(5),
      comment: z.string().trim().max(1000).optional(),
    })
    .refine((data) => data.jobId || data.job, { message: "Job ID is required" }),
});

export const ReviewDto = {
  createReview: createReviewDto,
};
