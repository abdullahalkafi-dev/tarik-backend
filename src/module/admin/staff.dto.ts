import { z } from "zod";
import { PERMISSIONS, ROLE_PRESETS } from "../../config/permissions";

const presetKeys = Object.keys(ROLE_PRESETS) as [string, ...string[]];
const permission = z.enum([...PERMISSIONS, "*"] as [string, ...string[]]);

export const CreateStaffDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
      email: z.string().trim().email("Invalid email address"),
      phone: z.string().trim().min(10, "Phone number is required").max(20).optional(),
      // The staff member must change this temporary password at first login.
      password: z.string().min(8, "Password must be at least 8 characters").max(128),
      rolePreset: z.enum(presetKeys).optional(),
      permissions: z.array(permission).max(30).optional(),
    })
    .strict(),
});

export const UpdateStaffDto = z.object({
  params: z.object({
    staffId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id"),
  }),
  body: z
    .object({
      rolePreset: z.enum(presetKeys).optional(),
      permissions: z.array(permission).max(30).optional(),
      status: z.enum(["active", "suspended"]).optional(),
      name: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().max(20).optional(),
    })
    .strict(),
});

export const StaffIdDto = z.object({
  params: z.object({
    staffId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id"),
  }),
});
