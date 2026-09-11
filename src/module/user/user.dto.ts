import z from "zod";

const updateProfileDto = z.object({
  body: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      email: z.string().trim().email().optional(),
      bio: z.string().trim().max(500).optional(),
      phone: z.string().trim().min(1).max(20).optional(),
      address: z.string().trim().max(500).optional(),
      avatar: z.string().optional(),
      age: z.number().int().min(13).optional(),
      city: z.string().trim().max(100).optional(),
      language: z.string().trim().max(50).optional(),
      serviceType: z.string().optional(),
      pricePerHour: z.number().positive("Price must be positive").optional(),
      experience: z.number().int().min(0, "Experience cannot be negative").optional(),
      serviceRadius: z.number().positive("Radius must be positive").optional(),
      profilePhotos: z.array(z.string()).max(5).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      latitude: z.number().min(-90).max(90).optional(),
    })
    .strict(),
});

const updateLocationDto = z.object({
  body: z
    .object({
      longitude: z.number().min(-180).max(180),
      latitude: z.number().min(-90).max(90),
      address: z.string().trim().max(500).optional(),
    })
    .strict(),
});

const helperApplyDto = z.object({
  body: z
    .object({
      age: z.number().int().min(13, "Must be 13 or older"),
      city: z.string().trim().min(1, "City is required").max(100),
      language: z.string().trim().min(1, "Language is required").max(50),
      serviceType: z.string().min(1, "Service type is required"),
      pricePerHour: z.number().positive("Price must be positive"),
      experience: z.number().int().min(0, "Experience cannot be negative"),
      serviceRadius: z.number().positive("Radius must be positive"),
      profilePhotos: z.array(z.string()).max(5).optional(),
      documentType: z.enum(["nid", "passport", "driving_license", "residence_permit"]).optional(),
      documentUrl: z.string().optional(),
      selfieUrl: z.string().optional(),
      phone: z.string().trim().min(1).max(20).optional(),
      email: z.string().trim().email().optional(),
      avatar: z.string().optional(),
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
    })
    .strict(),
});

const clearDeviceTokenDto = z.object({
  body: z.object({}).strict().optional(),
});

export const UserDto = {
  updateProfile: updateProfileDto,
  updateLocation: updateLocationDto,
  helperApply: helperApplyDto,
  submitAppeal: submitAppealDto,
  registerDeviceToken: registerDeviceTokenDto,
  clearDeviceToken: clearDeviceTokenDto,
};
