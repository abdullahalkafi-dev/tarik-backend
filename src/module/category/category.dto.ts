import z from "zod";

// null clears a value from the dashboard
const price = z.number().min(0).max(100000).nullable().optional();

const pricingFields = {
  minHourlyRate: price,
  suggestedPriceMin: price,
  suggestedPriceMax: price,
};

const names = z
  .object({
    en: z.string().trim().max(100).optional(),
    fr: z.string().trim().max(100).optional(),
    ar: z.string().trim().max(100).optional(),
    es: z.string().trim().max(100).optional(),
  })
  .strict();

const refinePriceRange = (
  data: { suggestedPriceMin?: number | null; suggestedPriceMax?: number | null },
  ctx: z.RefinementCtx,
) => {
  const { suggestedPriceMin: min, suggestedPriceMax: max } = data;
  if (min != null && max != null && min > max) {
    ctx.addIssue({
      code: "custom",
      message: "Suggested minimum price cannot be higher than the maximum",
      path: ["suggestedPriceMax"],
    });
  }
};

// `icon` is an uploaded file key (icons/…, images/…) or a file URL from this API.
const createDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(1, "Name is required").max(100),
      icon: z.string().max(500).optional(),
      names: names.optional(),
      sortOrder: z.number().int().min(0).max(10000).optional(),
      isPopular: z.boolean().optional(),
      ...pricingFields,
    })
    .strict()
    .superRefine(refinePriceRange),
});

const updateDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      icon: z.string().max(500).optional(),
      isActive: z.boolean().optional(),
      names: names.optional(),
      sortOrder: z.number().int().min(0).max(10000).optional(),
      isPopular: z.boolean().optional(),
      ...pricingFields,
    })
    .strict()
    .superRefine(refinePriceRange),
  params: z.object({
    id: z.string().min(1, "Category ID is required"),
  }),
});

export const CategoryDto = {
  create: createDto,
  update: updateDto,
};
