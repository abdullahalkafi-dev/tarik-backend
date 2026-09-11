import z from "zod";

const approveHelperDto = z.object({
  params: z.object({
    userId: z.string().min(1, "User ID is required"),
  }),
});

const rejectHelperDto = z.object({
  params: z.object({
    userId: z.string().min(1, "User ID is required"),
  }),
  body: z
    .object({
      rejectionReason: z.string().trim().max(500).optional(),
      reason: z.string().trim().max(500).optional(),
    }),
});

const getHelperByIdDto = z.object({
  params: z.object({
    userId: z.string().min(1, "User ID is required"),
  }),
});

const permanentBanHelperDto = z.object({
  params: z.object({
    userId: z.string().min(1, "User ID is required"),
  }),
  body: z
    .object({
      reason: z.string().trim().min(3, "Ban reason is required").max(500),
    })
    .strict(),
});

const unbanHelperDto = z.object({
  params: z.object({
    userId: z.string().min(1, "User ID is required"),
  }),
  body: z
    .object({
      reason: z.string().trim().max(500).optional(),
    })
    .optional(),
});

const listHelpersDto = z.object({
  query: z
    .object({
      status: z
        .enum(["pending", "approved", "rejected", "pending_appeal"])
        .optional(),
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(1000).default(20).optional(),
    }),
});

const listUsersDto = z.object({
  query: z
    .object({
      search: z.string().optional(),
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(1000).default(20).optional(),
    }),
});

const blockUserDto = z.object({
  params: z.object({
    userId: z.string().min(1, "User ID is required"),
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
};

