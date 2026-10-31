import z from "zod";
import { refineTimeRange } from "../../util/hourly";
import { refineInServiceArea } from "../../util/validators";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
const MAX_BUDGET = 100_000;

export const CANCEL_REASON_CODES = [
  "changed_mind",
  "found_other",
  "helper_late",
  "helper_unreachable",
  "price_issue",
  "emergency",
  "wrong_details",
  "other",
] as const;

const createJobDto = z.object({
  body: z
    .object({
      title: z.string().trim().min(1, "Title is required").max(200),
      description: z.string().trim().max(2000).optional(),
      // A real calendar day (YYYY-MM-DD, optionally followed by a time part).
      date: z
        .string()
        .trim()
        .max(40)
        .regex(ISO_DAY, "Date must look like 2026-01-31"),
      startTime: z.string().trim().max(20).optional(),
      endTime: z.string().trim().max(20).optional(),
      // Fixed job: the total. Hourly job: the hourly rate (the server multiplies by the hours).
      budget: z.number().positive("Budget must be positive").max(MAX_BUDGET),
      budgetType: z.enum(["hourly", "fixed"]).default("fixed"),
      paymentMethod: z.enum(["online", "cash"]).default("cash"),
      address: z.string().trim().min(1, "Address is required").max(500),
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90),
      images: z.array(z.string().max(500)).max(4).optional(),
      category: z.string().min(1, "Category is required"),
    })
    .strict()
    .superRefine(refineTimeRange)
    .superRefine((data, ctx) => {
      if (data.budgetType === "hourly" && (!data.startTime || !data.endTime)) {
        ctx.addIssue({
          code: "custom",
          message: "Start and end time are required for an hourly price",
          path: ["startTime"],
        });
      }
    })
    .superRefine(refineInServiceArea),
});

// Only non-financial details and the (unpaid) price may be edited; category,
// payment method and price type are fixed once the job is posted.
const updateJobDto = z.object({
  body: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(2000).optional(),
      date: z.string().trim().max(40).regex(ISO_DAY, "Date must look like 2026-01-31").optional(),
      startTime: z.string().trim().max(20).optional(),
      endTime: z.string().trim().max(20).optional(),
      budget: z.number().positive().max(MAX_BUDGET).optional(),
      address: z.string().trim().min(1).max(500).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      images: z.array(z.string().max(500)).max(4).optional(),
    })
    .strict()
    .superRefine(refineInServiceArea),
});

// Admin / dashboard list of all jobs.
const jobQueryDto = z.object({
  query: z.object({
    category: z.string().optional(),
    status: z.string().optional(),
    paymentMethod: z.string().optional(),
    search: z.string().max(80).optional(),
    assignedTo: z.string().optional(),
    postedBy: z.string().optional(),
    page: z.coerce.number().int().positive().default(1).optional(),
    limit: z.coerce.number().int().positive().max(200).default(20).optional(),
  }),
});

const nearbyQueryDto = z.object({
  query: z.object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    // metres (the apps send kilometres × 1000)
    maxDistance: z.coerce.number().positive().max(200_000).optional(),
    category: z.string().optional(),
    page: z.coerce.number().int().positive().max(500).optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
  }),
});

const myListQueryDto = z.object({
  query: z.object({
    tab: z.enum(["completed", "cancelled"]).optional(),
    page: z.coerce.number().int().positive().max(1000).optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
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
      code: z.enum(CANCEL_REASON_CODES).optional(),
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

const reportProblemDto = z.object({
  body: z
    .object({
      message: z.string().trim().min(10, "Please describe the problem").max(1000),
    })
    .strict(),
});

export const JobDto = {
  createJob: createJobDto,
  updateJob: updateJobDto,
  jobQuery: jobQueryDto,
  nearbyQuery: nearbyQueryDto,
  myListQuery: myListQueryDto,
  cancelJob: cancelJobDto,
  completeJob: completeJobDto,
  reportProblem: reportProblemDto,
};
