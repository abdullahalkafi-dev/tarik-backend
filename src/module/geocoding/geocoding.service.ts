import { StatusCodes } from "http-status-codes";
import AppError from "../../errors/AppError";
import config from "../../config";
import { logger } from "../../logger/logger";
import redisClient from "../../redis/redisClient";
import { isCoordinateInAllowedRegion } from "../../util/geo";

const TIMEOUT_MS = 10000;
const CACHE_TTL_SECONDS = 10 * 60;
const DEFAULT_BIAS = { lat: 33.5731, lon: -7.5898 }; // Casablanca

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

const unavailable = () =>
  new AppError(StatusCodes.BAD_GATEWAY, "Address search is temporarily unavailable. Please try again.", {
    code: "GEOCODER_UNAVAILABLE",
  });

/** Identical requests within minutes are answered from Redis (saves quota, survives typing bursts). */
const cached = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
  if (redisClient.isAvailable()) {
    try {
      const hit = await redisClient.get(`geo:${key}`);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // cache miss
    }
  }
  const value = await load();
  if (redisClient.isAvailable()) {
    try {
      await redisClient.set(`geo:${key}`, JSON.stringify(value), CACHE_TTL_SECONDS);
    } catch {
      // cache write is best effort
    }
  }
  return value;
};

const hereLang = (lang?: string) => {
  const l = String(lang || "").slice(0, 2).toLowerCase();
  return ({ ar: "ar", fr: "fr", en: "en", es: "es" } as Record<string, string>)[l] || "fr";
};

const alpha3Countries = () =>
  config.geo.allowed_countries
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c));

const fetchJson = async (url: URL) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) {
      logger.warn(`HERE geocoding failed: ${response.status}`);
      throw unavailable();
    }
    return (await response.json()) as any;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error(`HERE geocoding error: ${error instanceof Error ? error.message : error}`);
    throw unavailable();
  } finally {
    clearTimeout(timeoutId);
  }
};

const reverseGeocode = async (lat: number, lon: number, lang?: string): Promise<ReverseGeocodeResult> => {
  // Never turn a position outside the service area into an "address" the apps could save.
  if (!isCoordinateInAllowedRegion(lat, lon)) {
    throw new AppError(StatusCodes.UNPROCESSABLE_ENTITY, "This location is outside the supported service area", {
      code: "OUTSIDE_SERVICE_AREA",
    });
  }

  const language = hereLang(lang);
  const key = `rev:${language}:${lat.toFixed(4)},${lon.toFixed(4)}`;

  return cached(key, async () => {
    const url = new URL(
      config.here.revgeocode_base_url.endsWith("/revgeocode")
        ? config.here.revgeocode_base_url
        : `${config.here.revgeocode_base_url}/revgeocode`,
    );
    url.searchParams.append("at", `${lat},${lon}`);
    url.searchParams.append("lang", language);
    url.searchParams.append("apiKey", config.here.api_key);

    const data = await fetchJson(url);
    const item = data.items?.[0];
    if (!item) return {};

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
  });
};

const forwardGeocode = async (
  query: string,
  limit: number = 5,
  options: { lang?: string; lat?: number; lon?: number } = {},
): Promise<ForwardGeocodeResult[]> => {
  const language = hereLang(options.lang);
  const bias =
    options.lat != null && options.lon != null && isCoordinateInAllowedRegion(options.lat, options.lon)
      ? { lat: options.lat, lon: options.lon }
      : DEFAULT_BIAS;
  const key = `fwd:${language}:${bias.lat.toFixed(2)},${bias.lon.toFixed(2)}:${limit}:${query.trim().toLowerCase()}`;

  return cached(key, async () => {
    const url = new URL(
      config.here.geocode_base_url.endsWith("/geocode")
        ? config.here.geocode_base_url
        : `${config.here.geocode_base_url}/geocode`,
    );
    url.searchParams.append("q", query);
    url.searchParams.append("limit", String(limit));
    url.searchParams.append("lang", language);
    url.searchParams.append("apiKey", config.here.api_key);
    // HERE only accepts ISO 3166-1 alpha-3 codes here.
    const alpha3 = alpha3Countries();
    if (alpha3.length) {
      url.searchParams.append("in", `countryCode:${alpha3.join(",")}`);
    }
    // Rank results around the user (or Casablanca) first.
    url.searchParams.append("at", `${bias.lat},${bias.lon}`);

    const data = await fetchJson(url);

    return ((data.items || []) as any[])
      .filter((item) => item.position?.lat != null && item.position?.lng != null)
      .map((item) => ({
        displayName: item.address?.label || item.title || "",
        lat: item.position.lat,
        lon: item.position.lng,
        city: item.address?.city || item.address?.district || item.address?.county,
        postcode: item.address?.postalCode,
        state: item.address?.state,
        country: item.address?.countryName,
      }))
      .filter((r) => isCoordinateInAllowedRegion(r.lat, r.lon));
  });
};

export const GeocodingService = {
  reverseGeocode,
  forwardGeocode,
};
