import z from "zod";
import { isCoordinateInAllowedRegion } from "../../util/geo";
import { personName, refineInServiceArea } from "../../util/validators";

// Kept for backwards compatibility with older imports.
export { isCoordinateInAllowedRegion };

const MIN_HELPER_AGE = 18;

const notificationPrefs = z
  .object({
    push: z.boolean().optional(),
    sound: z.boolean().optional(),
    vibrate: z.boolean().optional(),
    payments: z.boolean().optional(),
    appUpdates: z.boolean().optional(),
    newService: z.boolean().optional(),
  })
  .strict();

const updateProfileDto = z.object({
  body: z
    .object({
      name: personName().optional(),
      // Empty string means "leave email unchanged" (optional for clients).
      email: z.preprocess(
        (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
        z.string().trim().toLowerCase().email().max(160).optional(),
      ),
      bio: z.string().trim().max(500).optional(),
      phone: z.string().trim().min(1).max(20).optional(),
      address: z.string().trim().max(500).optional(),
      avatar: z.string().max(500).optional(),
      age: z.number().int().min(MIN_HELPER_AGE, "You must be at least 18 years old").max(100).optional(),
      city: z.string().trim().max(100).optional(),
      language: z.string().trim().max(100).optional(),
      locale: z.enum(["ar", "fr", "en", "es"]).optional(),
      serviceType: z.string().optional(),
      pricePerHour: z
        .number()
        .positive("Price must be positive")
        .max(2000, "Hourly rate cannot be higher than 2000 MAD")
        .optional(),
      experience: z
        .number()
        .int()
        .min(0, "Experience cannot be negative")
        .max(60, "Experience cannot be higher than 60 years")
        .optional(),
      serviceRadius: z
        .number()
        .min(0.5, "Radius must be at least 0.5 km")
        .max(60, "Radius cannot be larger than 60 km")
        .optional(),
      profilePhotos: z.array(z.string().max(500)).max(5).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      notificationPrefs: notificationPrefs.optional(),
      isAvailable: z.boolean().optional(),
    })
    .strict()
    .superRefine(refineInServiceArea),
});

const updateLocationDto = z.object({
  body: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90),
      address: z.string().trim().max(500).optional(),
    })
    .strict()
    .refine((data) => isCoordinateInAllowedRegion(data.latitude, data.longitude), {
      message: "This location is outside the supported service area",
      path: ["latitude"],
    }),
});

const helperApplyDto = z.object({
  body: z
    .object({
      age: z.number().int().min(MIN_HELPER_AGE, "You must be at least 18 years old").max(100),
      city: z.string().trim().min(1, "City is required").max(100),
      language: z.string().trim().min(1, "Language is required").max(100),
      serviceType: z.string().min(1, "Service type is required"),
      pricePerHour: z.number().positive("Price must be positive").max(2000, "Hourly rate cannot be higher than 2000 MAD"),
      experience: z.number().int().min(0, "Experience cannot be negative").max(60),
      serviceRadius: z.number().min(0.5, "Radius must be at least 0.5 km").max(60, "Radius cannot be larger than 60 km"),
      profilePhotos: z.array(z.string().max(500)).max(5).optional(),
      documentType: z.enum(["nid", "passport", "driving_license", "residence_permit"]).optional(),
      documentUrl: z.string().max(500).optional(),
      selfieUrl: z.string().max(500).optional(),
      phone: z.string().trim().min(1).max(20).optional(),
      email: z.string().trim().toLowerCase().email().max(160).optional(),
      avatar: z.string().max(500).optional(),
      bio: z.string().trim().max(500).optional(),
    })
    .strict(),
});

const submitAppealDto = z.object({
  body: z
    .object({
      message: z
        .string()
        .trim()
        .min(5, "Appeal message must be at least 5 characters")
        .max(1000, "Appeal message must be under 1000 characters"),
    })
    .strict(),
});

const registerDeviceTokenDto = z.object({
  body: z
    .object({
      token: z.string().trim().min(1, "Device token is required").max(4096),
      platform: z.enum(["android", "ios"]).optional(),
      locale: z.enum(["ar", "fr", "en", "es"]).optional(),
    })
    .strict(),
});

const clearDeviceTokenDto = z.object({
  body: z
    .object({
      token: z.string().trim().max(4096).optional(),
    })
    .strict()
    .optional(),
});

const availabilityDto = z.object({
  body: z.object({ isAvailable: z.boolean() }).strict(),
});

const acceptLegalDto = z.object({
  body: z.object({ version: z.number().int().min(1) }).strict(),
});

const deleteAccountDto = z.object({
  body: z
    .object({
      password: z.string().min(1, "Password is required").max(128),
    })
    .strict(),
});

const searchHelpersDto = z.object({
  query: z.object({
    category: z.string().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    maxDistance: z.coerce.number().positive().max(100_000).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    maxPrice: z.coerce.number().positive().max(100_000).optional(),
    sort: z.enum(["nearest", "rating", "price_low", "price_high"]).optional(),
    availableNow: z.enum(["true", "false"]).optional(),
    search: z.string().trim().max(60).optional(),
    page: z.coerce.number().int().positive().max(1000).optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
  }),
});

export const UserDto = {
  updateProfile: updateProfileDto,
  updateLocation: updateLocationDto,
  helperApply: helperApplyDto,
  submitAppeal: submitAppealDto,
  registerDeviceToken: registerDeviceTokenDto,
  clearDeviceToken: clearDeviceTokenDto,
  availability: availabilityDto,
  acceptLegal: acceptLegalDto,
  deleteAccount: deleteAccountDto,
  searchHelpers: searchHelpersDto,
};
