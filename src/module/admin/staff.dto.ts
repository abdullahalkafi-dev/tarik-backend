import { z } from "zod";

export const CreateStaffDto = z.object({
  body: z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number is required").optional(),
    password: z.string().min(8, "Password must be at least 8 characters"),
    permissions: z
      .array(z.string())
      .optional()
      .default(["*"]),
  }),
});

export const UpdateStaffDto = z.object({
  params: z.object({
    staffId: z.string().min(1, "Staff ID is required"),
  }),
  body: z.object({
    permissions: z.array(z.string()).optional(),
    status: z.enum(["active", "suspended"]).optional(),
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
  }),
});

export const StaffIdDto = z.object({
  params: z.object({
    staffId: z.string().min(1, "Staff ID is required"),
  }),
});
