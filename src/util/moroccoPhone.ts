import { StatusCodes } from "http-status-codes";
import AppError from "../errors/AppError";

export const MOROCCAN_MOBILE_REGEX = /^\+212[67]\d{8}$/;

/**
 * Normalizes and validates Moroccan mobile phone numbers.
 * Accepts formats:
 * - 0612345678 / 0712345678
 * - +212612345678 / +212712345678
 * - 00212612345678 / 212612345678
 * - With spaces, hyphens, or parentheses
 *
 * Strictly rejects landlines (05... / +2125...).
 */
export const normalizeMoroccoPhone = (input: string): string => {
  if (!input || typeof input !== "string") {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Phone number is required",
    );
  }

  // Strip all non-digit characters except leading '+'
  let cleaned = input.trim().replace(/[\s\-\(\)]/g, "");

  // Convert 00212... to +212...
  if (cleaned.startsWith("00212")) {
    cleaned = "+212" + cleaned.slice(5);
  } else if (cleaned.startsWith("212") && !cleaned.startsWith("+212")) {
    cleaned = "+" + cleaned;
  } else if (cleaned.startsWith("06") || cleaned.startsWith("07")) {
    cleaned = "+212" + cleaned.slice(1);
  } else if (cleaned.startsWith("05") || cleaned.startsWith("+2125") || cleaned.startsWith("2125")) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Please enter a mobile phone number (06 or 07) to receive your WhatsApp code. Landline numbers are not supported.",
    );
  } else if (!cleaned.startsWith("+212")) {
    // If user provided a 9-digit number starting with 6 or 7
    if (/^[67]\d{8}$/.test(cleaned)) {
      cleaned = "+212" + cleaned;
    }
  }

  if (!MOROCCAN_MOBILE_REGEX.test(cleaned)) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Invalid Moroccan mobile phone number. Format should be +212 6/7 followed by 8 digits (e.g. +212612345678).",
    );
  }

  return cleaned;
};
