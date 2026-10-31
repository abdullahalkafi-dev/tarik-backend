import { StatusCodes } from "http-status-codes";
import AppError from "../errors/AppError";
import { parseHoursBetween } from "./hourly";

export type TPricing = {
  /** Total in MAD (what is charged, what the commission and the payout are based on). */
  total: number;
  hourlyRate?: number;
  hours?: number;
};

/**
 * One pricing rule for jobs AND offers, computed only on the server:
 *  - fixed  → the number the client typed is the total;
 *  - hourly → total = hourly rate × hours between start and end time.
 */
export const computePricing = (input: {
  priceType: "fixed" | "hourly";
  amount: number;
  startTime?: string | null;
  endTime?: string | null;
}): TPricing => {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Price must be greater than 0", {
      code: "INVALID_PRICE",
    });
  }

  if (input.priceType !== "hourly") {
    return { total: Math.round(amount) };
  }

  const hours = parseHoursBetween(input.startTime, input.endTime);
  if (hours == null || hours <= 0) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Start and end time are required for an hourly price",
      { code: "HOURS_REQUIRED" },
    );
  }
  return {
    total: Math.round(amount * hours),
    hourlyRate: Math.round(amount * 100) / 100,
    hours: Math.round(hours * 100) / 100,
  };
};

/** Commission in whole MAD for a total and a percentage. */
export const commissionFor = (total: number, feePercentage: number): number =>
  Math.round((total * feePercentage) / 100);

/** What the helper keeps from an online job. */
export const helperNetFor = (total: number, feePercentage: number): number =>
  Math.max(0, total - commissionFor(total, feePercentage));
