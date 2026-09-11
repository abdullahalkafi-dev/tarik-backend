import config from "../../config";
import { logger } from "../../logger/logger";

const TIMEOUT_MS = 10000;

type ReverseGeocodeResult = {
  address?: string;
  city?: string;
  postcode?: string;
  state?: string;
  country?: string;
  lat?: number;
  lon?: number;
};

type ForwardGeocodeResult = {
  displayName: string;
  lat: number;
  lon: number;
  city?: string;
  postcode?: string;
  state?: string;
  country?: string;
};

const reverseGeocode = async (
  lat: number,
  lon: number,
): Promise<ReverseGeocodeResult> => {
  try {
    const url = new URL(`${config.locationiq.base_url}/reverse`);
    url.searchParams.append("key", config.locationiq.api_key);
    url.searchParams.append("lat", String(lat));
    url.searchParams.append("lon", String(lon));
    url.searchParams.append("format", "json");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`LocationIQ reverse geocode failed: ${response.status}`);
      return {};
    }

    const data = (await response.json()) as {
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: {
        city?: string;
        town?: string;
        village?: string;
        postcode?: string;
        state?: string;
        country?: string;
      };
    };

    const addr = data.address || {};
    return {
      address: data.display_name,
      city: addr.city || addr.town || addr.village,
      postcode: addr.postcode,
      state: addr.state,
      country: addr.country,
      lat: data.lat ? Number(data.lat) : undefined,
      lon: data.lon ? Number(data.lon) : undefined,
    };
  } catch (error) {
    logger.error("Reverse geocode error:", error);
    return {};
  }
};

const forwardGeocode = async (
  query: string,
  limit: number = 5,
): Promise<ForwardGeocodeResult[]> => {
  try {
    const url = new URL(`${config.locationiq.base_url}/search`);
    url.searchParams.append("key", config.locationiq.api_key);
    url.searchParams.append("q", query);
    url.searchParams.append("format", "json");
    url.searchParams.append("limit", String(limit));
    // countrycodes removed — allow global search (Morocco-only was here before)

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`LocationIQ forward geocode failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
      address?: {
        city?: string;
        town?: string;
        village?: string;
        postcode?: string;
        state?: string;
        country?: string;
      };
    }>;

    return data.map((item) => ({
      displayName: item.display_name || "",
      lat: item.lat ? Number(item.lat) : 0,
      lon: item.lon ? Number(item.lon) : 0,
      city: item.address?.city || item.address?.town || item.address?.village,
      postcode: item.address?.postcode,
      state: item.address?.state,
      country: item.address?.country,
    }));
  } catch (error) {
    logger.error("Forward geocode error:", error);
    return [];
  }
};

export const GeocodingService = {
  reverseGeocode,
  forwardGeocode,
};
