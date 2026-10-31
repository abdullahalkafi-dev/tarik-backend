import z from "zod";

const reverseGeocodeDto = z.object({
  query: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
    lang: z.string().max(10).optional(),
  }),
});

const forwardGeocodeDto = z.object({
  query: z.object({
    q: z.string().trim().min(1, "Search query is required").max(200),
    limit: z.coerce.number().int().min(1).max(10).default(5).optional(),
    // Optional bias point (the user's position) so nearby results rank first.
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    lang: z.string().max(10).optional(),
  }),
});

export const GeocodingDto = {
  reverse: reverseGeocodeDto,
  forward: forwardGeocodeDto,
};
