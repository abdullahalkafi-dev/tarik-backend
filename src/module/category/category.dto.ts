import z from "zod";

const createDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(1, "Name is required").max(100),
      icon: z.string().url("Invalid icon URL").optional(),
    })
    .strict(),
});

const updateDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      icon: z.string().url("Invalid icon URL").optional(),
      isActive: z.boolean().optional(),
    })
    .strict(),
  params: z.object({
    id: z.string().min(1, "Category ID is required"),
  }),
});

export const CategoryDto = {
  create: createDto,
  update: updateDto,
};
