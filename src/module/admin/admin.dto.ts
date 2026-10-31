import z from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const userIdParams = z.object({ userId: objectId });

const approveHelperDto = z.object({
  params: userIdParams,
});

const rejectHelperDto = z.object({
  params: userIdParams,
  body: z.object({
    rejectionReason: z.string().trim().max(500).optional(),
    reason: z.string().trim().max(500).optional(),
  }),
});

const getHelperByIdDto = z.object({
  params: userIdParams,
});

const permanentBanHelperDto = z.object({
  params: userIdParams,
  body: z
    .object({
      reason: z.string().trim().min(3, "Ban reason is required").max(500),
    })
    .strict(),
});

const unbanHelperDto = z.object({
  params: userIdParams,
  body: z
    .object({
      reason: z.string().trim().max(500).optional(),
    })
    .optional(),
});

const listHelpersDto = z.object({
  query: z.object({
    status: z.enum(["pending", "approved", "rejected", "pending_appeal"]).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().positive().max(10000).optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  }),
});

const listUsersDto = z.object({
  query: z.object({
    search: z.string().trim().max(80).optional(),
    status: z.enum(["active", "blocked"]).optional(),
    page: z.coerce.number().int().positive().max(10000).optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  }),
});

const blockUserDto = z.object({
  params: userIdParams,
  body: z
    .object({
      reason: z.string().trim().min(5, "A reason of at least 5 characters is required").max(500),
    })
    .strict(),
});

const unblockUserDto = z.object({
  params: userIdParams,
  body: z.object({ reason: z.string().trim().max(500).optional() }).optional(),
});

const updateProfileDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      phone: z.string().trim().max(20).optional(),
      avatar: z.string().max(500).optional(),
    })
    .strict(),
});

const mapQueryDto = z.object({
  query: z.object({
    liveOnly: z.enum(["true", "false"]).optional(),
    limit: z.coerce.number().int().positive().max(1000).optional(),
  }),
});

export const AdminDto = {
  getHelperById: getHelperByIdDto,
  approveHelper: approveHelperDto,
  rejectHelper: rejectHelperDto,
  permanentBanHelper: permanentBanHelperDto,
  unbanHelper: unbanHelperDto,
  listHelpers: listHelpersDto,
  listUsers: listUsersDto,
  blockUser: blockUserDto,
  unblockUser: unblockUserDto,
  updateProfile: updateProfileDto,
  mapQuery: mapQueryDto,
};
