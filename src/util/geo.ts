import crypto from "crypto";
import config from "../config";

const EARTH_RADIUS_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Distance rounded to one decimal place (what the apps display). */
export const roundKm = (km: number): number => Math.round(km * 10) / 10;

/**
 * Service-area check. Morocco (including the southern provinces) is always
 * accepted; other countries only when listed in ALLOWED_COUNTRIES (testing).
 */
export const isCoordinateInAllowedRegion = (lat: number, lon: number): boolean => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  const isMorocco = lat >= 20.7 && lat <= 36.0 && lon >= -17.2 && lon <= -0.95;
  if (isMorocco) return true;

  const allowed = String(config.geo?.allowed_countries || "")
    .toUpperCase()
    .split(",")
    .map((c) => c.trim());

  if (allowed.some((c) => c === "BGD" || c === "BD")) {
    if (lat >= 20.5 && lat <= 26.7 && lon >= 88.0 && lon <= 92.7) return true;
  }
  if (allowed.some((c) => c === "GBR" || c === "GB" || c === "UK")) {
    if (lat >= 49.8 && lat <= 60.9 && lon >= -8.6 && lon <= 1.8) return true;
  }
  return false;
};

/**
 * Deterministic "blur" of a point by 300-500 m so a public listing never gives
 * away the exact door of a customer. The same seed (e.g. the job id) always
 * produces the same offset, so the pin does not jump between refreshes.
 */
export const approximateCoordinates = (
  coordinates: [number, number],
  seed: string,
): [number, number] => {
  const digest = crypto.createHash("sha256").update(seed).digest();
  const angle = (digest.readUInt16BE(0) / 65535) * 2 * Math.PI;
  const meters = 300 + (digest.readUInt16BE(2) / 65535) * 200;
  const [lon, lat] = coordinates;
  const dLat = (meters * Math.cos(angle)) / 111_320;
  const dLon = (meters * Math.sin(angle)) / (111_320 * Math.max(Math.cos(toRad(lat)), 0.01));
  return [Number((lon + dLon).toFixed(5)), Number((lat + dLat).toFixed(5))];
};

const COUNTRY_RE = /^(maroc|morocco|المغرب|marruecos)$/i;
// Parts of an address that identify a house / street rather than an area.
const STREET_RE =
  /^\d|\b(rue|avenue|av\.?|boulevard|bd|derb|impasse|lotissement|résidence|residence|immeuble|appartement|apt|bloc|n°|no\.?|km|route|angle|شارع|زنقة|درب|إقامة|عمارة)(\s|$)/i;

/**
 * "12 Rue Ibn Tofail, Maarif, Casablanca, Morocco" -> "Maarif, Casablanca":
 * the country and anything that looks like a house or street are dropped, at
 * most the last two area names remain.
 */
export const approximateAddress = (address?: string | null): string => {
  if (!address) return "";
  const parts = address
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => !COUNTRY_RE.test(p))
    .filter((p) => !STREET_RE.test(p));
  return parts.slice(-2).join(", ");
};
