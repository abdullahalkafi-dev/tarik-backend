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
    const url = new URL(
      config.here.revgeocode_base_url.endsWith("/revgeocode")
        ? config.here.revgeocode_base_url
        : `${config.here.revgeocode_base_url}/revgeocode`,
    );
    url.searchParams.append("at", `${lat},${lon}`);
    url.searchParams.append("apiKey", config.here.api_key);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`HERE reverse geocode failed: ${response.status}`);
      return {};
    }

    const data = (await response.json()) as {
      items?: Array<{
        title?: string;
        address?: {
          label?: string;
          city?: string;
          district?: string;
          county?: string;
          state?: string;
          countryName?: string;
          postalCode?: string;
        };
        position?: {
          lat?: number;
          lng?: number;
        };
      }>;
    };

    const item = data.items?.[0];
    if (!item) {
      return {};
    }

    const addr = item.address || {};
    return {
      address: addr.label || item.title,
      city: addr.city || addr.district || addr.county,
      postcode: addr.postalCode,
      state: addr.state,
      country: addr.countryName,
      lat: item.position?.lat,
      lon: item.position?.lng,
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
    const url = new URL(
      config.here.geocode_base_url.endsWith("/geocode")
        ? config.here.geocode_base_url
        : `${config.here.geocode_base_url}/geocode`,
    );
    url.searchParams.append("q", query);
    url.searchParams.append("limit", String(limit));
    url.searchParams.append("apiKey", config.here.api_key);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`HERE forward geocode failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as {
      items?: Array<{
        title?: string;
        address?: {
          label?: string;
          city?: string;
          district?: string;
          county?: string;
          state?: string;
          countryName?: string;
          postalCode?: string;
        };
        position?: {
          lat?: number;
          lng?: number;
        };
      }>;
    };

    return (data.items || []).map((item) => ({
      displayName: item.address?.label || item.title || "",
      lat: item.position?.lat ?? 0,
      lon: item.position?.lng ?? 0,
      city: item.address?.city || item.address?.district || item.address?.county,
      postcode: item.address?.postalCode,
      state: item.address?.state,
      country: item.address?.countryName,
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
