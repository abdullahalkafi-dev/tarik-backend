import crypto from "crypto";
import { StatusCodes } from "http-status-codes";
import AppError from "../errors/AppError";
import config from "../config";

/**
 * Uploaded files are stored under `<kind>/<ownerUserId>/<file>`.
 * Every user-supplied media field (avatar, job/offer photos, chat media, ticket
 * attachments, KYC documents) must be one of OUR keys and must belong to the
 * user who submits it — never an arbitrary external URL or somebody else's file.
 */
const KEY_RE = /^(images|documents|videos|icons)\/([0-9a-f]{24})\/[A-Za-z0-9._-]{1,200}$/;

/** Files in these prefixes are private: served only with a signed link. */
export const PRIVATE_PREFIXES = ["documents/"];

export const isPrivateKey = (key: string): boolean =>
  PRIVATE_PREFIXES.some((p) => key.startsWith(p));

/** Accepts a stored key or one of our own file URLs and returns the bare key. */
export const toStorageKey = (value: string): string => {
  let v = String(value || "").trim();
  if (!v) return "";
  const marker = "/api/v1/upload/files/";
  const idx = v.indexOf(marker);
  if (idx !== -1) v = v.slice(idx + marker.length);
  else if (v.includes("/tarik-uploads/")) v = v.split("/tarik-uploads/")[1];
  // Drop signature/query parameters of signed URLs.
  const q = v.indexOf("?");
  if (q !== -1) v = v.slice(0, q);
  return decodeURIComponent(v).replace(/^\/+/, "");
};

export const parseUploadKey = (key: string): { kind: string; owner: string } | null => {
  const m = KEY_RE.exec(key);
  return m ? { kind: m[1], owner: m[2] } : null;
};

/**
 * Validates one media reference submitted by `userId`.
 * `allowed` lists values the document already stores (kept as-is even if legacy).
 */
export const assertOwnUploadKey = (
  value: string,
  userId: string,
  options: { allowed?: string[]; kinds?: string[]; isStaff?: boolean } = {},
): string => {
  const key = toStorageKey(value);
  if ((options.allowed || []).map(toStorageKey).includes(key)) return key;

  const parsed = parseUploadKey(key);
  if (!parsed) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid file reference", {
      code: "INVALID_FILE_KEY",
    });
  }
  if (options.kinds && !options.kinds.includes(parsed.kind)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "This file type is not allowed here", {
      code: "INVALID_FILE_KIND",
    });
  }
  if (!options.isStaff && parsed.owner !== String(userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "You can only use files you uploaded", {
      code: "FILE_NOT_OWNED",
    });
  }
  return key;
};

export const assertOwnUploadKeys = (
  values: string[] | undefined,
  userId: string,
  options: { allowed?: string[]; kinds?: string[]; isStaff?: boolean } = {},
): string[] => (values || []).map((v) => assertOwnUploadKey(v, userId, options));

// ─── Signed links for private files ──────────────────────
const signingSecret = () => `${config.jwt.jwt_secret || "dev"}:file-links`;

export const signFileKey = (key: string, ttlSeconds = 6 * 3600) => {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac("sha256", signingSecret())
    .update(`${key}:${exp}`)
    .digest("hex")
    .slice(0, 40);
  return { exp, sig };
};

export const verifyFileSignature = (key: string, exp: unknown, sig: unknown): boolean => {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
  if (typeof sig !== "string" || sig.length !== 40) return false;
  const expected = crypto
    .createHmac("sha256", signingSecret())
    .update(`${key}:${e}`)
    .digest("hex")
    .slice(0, 40);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
};
