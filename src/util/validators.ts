import z from "zod";
import { isCoordinateInAllowedRegion } from "./geo";

/**
 * Person / place names: letters (any alphabet, so Arabic and accents work),
 * digits, spaces and . ' - _  — nothing that could be markup.
 */
export const NAME_RE = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s.'’\-_]*$/u;

export const personName = (max = 100) =>
  z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(max)
    .regex(NAME_RE, "Name contains characters that are not allowed");

/** Latitude/longitude pair that must be inside the service area. */
export const refineInServiceArea = <T extends { latitude?: number; longitude?: number }>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (
    typeof data.latitude === "number" &&
    typeof data.longitude === "number" &&
    !isCoordinateInAllowedRegion(data.latitude, data.longitude)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "This location is outside the supported service area",
      path: ["latitude"],
    });
  }
};

export const objectIdString = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
