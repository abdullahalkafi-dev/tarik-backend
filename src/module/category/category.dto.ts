import z from "zod";

// null clears a value from the dashboard
const price = z.number().min(0).max(100000).nullable().optional();

const pricingFields = {
  minHourlyRate: price,
  suggestedPriceMin: price,
  suggestedPriceMax: price,
};

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

const createDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(1, "Name is required").max(100),
      icon: z.string().url("Invalid icon URL").optional(),
      ...pricingFields,
    })
    .strict()
    .superRefine(refinePriceRange),
});

const updateDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      icon: z.string().url("Invalid icon URL").optional(),
      isActive: z.boolean().optional(),
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
