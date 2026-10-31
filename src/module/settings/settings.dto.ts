import z from "zod";

const text = z.string().max(100_000);
const localized = z
  .object({
    en: text.optional(),
    fr: text.optional(),
    ar: text.optional(),
    es: text.optional(),
  })
  .strict();

const updateSettingsDto = z.object({
  body: z
    .object({
      platformName: z.string().trim().min(1).max(60).optional(),
      supportEmail: z.string().trim().email().max(120).optional(),
      contactPhone: z.string().trim().max(30).optional(),
      supportWhatsapp: z.string().trim().max(30).optional(),
      platformFeePercentage: z
        .number({ error: "Commission must be a number" })
        .min(0, "Commission cannot be negative")
        .max(50, "Commission cannot be higher than 50%")
        .optional(),
      minimumServiceAmount: z
        .number({ error: "Minimum amount must be a number" })
        .min(0, "Minimum amount cannot be negative")
        .max(100000)
        .optional(),
      minAppVersion: z
        .string()
        .trim()
        .regex(/^(\d+\.\d+\.\d+)?$/, "Use the format 1.2.3")
        .optional(),
      notifications: z
        .object({
          newUserRegistrations: z.boolean().optional(),
          successfulPayments: z.boolean().optional(),
          customerServiceTickets: z.boolean().optional(),
        })
        .strict()
        .optional(),
      legal: z
        .object({
          termsOfService: text.optional(),
          privacyPolicy: text.optional(),
          translations: z
            .object({
              termsOfService: localized.optional(),
              privacyPolicy: localized.optional(),
            })
            .strict()
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
});

export const SettingsDto = { update: updateSettingsDto };
