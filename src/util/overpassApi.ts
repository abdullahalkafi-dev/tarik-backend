import AppError from "errors/AppError";
import { StatusCodes } from "http-status-codes";

export interface OSMPlace {
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address?: string;
  type: string;
}

export interface ReverseGeocodeResult {
  address?: string;
  city?: string;
  country?: string;
}

export const queryOverpassAPI = async (
  lat: number,
  lon: number,
  radiusMeters = 10000,
  limit = 10,
): Promise<OSMPlace[]> => {
  const radiusKm = Math.round(radiusMeters / 1000);

  const query = `
[out:json];
(
  node["amenity"="restaurant"](around:${radiusKm},${lat},${lon});
  node["amenity"="cafe"](around:${radiusKm},${lat},${lon});
  node["amenity"="bar"](around:${radiusKm},${lat},${lon});
  node["leisure"="park"](around:${radiusKm},${lat},${lon});
  node["tourism"="attraction"](around:${radiusKm},${lat},${lon});
);
out geom;
`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, `Overpass API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        elements?: Array<{ type?: string; tags?: Record<string, string>; lat?: number; lon?: number }>;
      };

      if (!data.elements?.length) return [];

      return data.elements
        .filter((el) => el.type === "node" && el.tags?.name && el.lat != null && el.lon != null)
        .slice(0, limit)
        .map((el) => ({
          name: el.tags!.name,
          category: el.tags!.amenity || el.tags!.leisure || el.tags!.tourism || "place",
          latitude: el.lat!,
          longitude: el.lon!,
          type: "osm-place" as const,
        }));
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(StatusCodes.INTERNAL_SERVER_ERROR, "Failed to fetch places from OpenStreetMap");
  }
};

export const reverseGeocodeCoordinates = async (
  lat: number,
  lon: number,
): Promise<ReverseGeocodeResult> => {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.append("lat", String(lat));
    url.searchParams.append("lon", String(lon));
    url.searchParams.append("format", "json");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "Tarik/1.0" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return {};

      const data = (await response.json()) as {
        address?: { city?: string; town?: string; country?: string };
        display_name?: string;
      };

      const addr = data.address || {};
      return {
        address: data.display_name,
        city: addr.city || addr.town,
        country: addr.country,
      };
    } catch {
      return {};
    }
  } catch {
    return {};
  }
};
