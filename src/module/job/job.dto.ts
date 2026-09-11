import z from "zod";

const createJobDto = z.object({
  body: z
    .object({
      title: z.string().trim().min(1, "Title is required").max(200),
      description: z.string().trim().max(2000).optional(),
      date: z.string().optional(),
      startTime: z.string().trim().max(20).optional(),
      endTime: z.string().trim().max(20).optional(),
      budget: z.number().positive("Budget must be positive"),
      budgetType: z.enum(["hourly", "fixed"]).default("fixed"),
      paymentMethod: z.enum(["online", "cash"]).default("cash"),
      address: z.string().trim().max(500).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      images: z.array(z.string()).max(4).optional(),
      category: z.string().min(1, "Category is required"),
    })
    .strict(),
});

const updateJobDto = z.object({
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).optional(),
      date: z.string().optional(),
      startTime: z.string().trim().max(20).optional(),
      endTime: z.string().trim().max(20).optional(),
      budget: z.number().positive().optional(),
      budgetType: z.enum(["hourly", "fixed"]).optional(),
      paymentMethod: z.enum(["online", "cash"]).optional(),
      address: z.string().trim().max(500).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      images: z.array(z.string()).max(4).optional(),
      category: z.string().optional(),
      // status intentionally omitted — use accept/complete/cancel endpoints
    })
    .strict(),
});

const jobQueryDto = z.object({
  query: z.object({
    category: z.string().optional(),
    status: z.string().optional(),
    paymentMethod: z.string().optional(),
    search: z.string().optional(),
    assignedTo: z.string().optional(),
    postedBy: z.string().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    maxDistance: z.coerce.number().positive().optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    limit: z.coerce.number().int().positive().max(1000).default(20).optional(),
  }),
});

const cancelJobDto = z.object({
  body: z
    .object({
      reason: z
        .string()
        .trim()
        .min(3, "Cancellation reason must be at least 3 characters")
        .max(500),
    })
    .strict(),
});

const completeJobDto = z.object({
  body: z
    .object({
      note: z.string().trim().max(500).optional(),
    })
    .strict()
    .optional(),
});

export const JobDto = {
  createJob: createJobDto,
  updateJob: updateJobDto,
  jobQuery: jobQueryDto,
  cancelJob: cancelJobDto,
  completeJob: completeJobDto,
};
