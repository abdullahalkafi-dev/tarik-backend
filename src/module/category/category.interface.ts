import { Types } from "mongoose";

export interface TCategory {
  _id: Types.ObjectId;
  name: string;
  icon?: string;
  isActive: boolean;
  /** Stable identifier used by the apps to pick the bundled icon / colour. */
  slug?: string;
  /** Display names per language; `name` stays the canonical English name. */
  names?: { en?: string; fr?: string; ar?: string; es?: string };
  sortOrder?: number;
  isPopular?: boolean;
  // Price guidance (MAD). All optional; null/undefined = no guidance.
  minHourlyRate?: number | null;
  suggestedPriceMin?: number | null;
  suggestedPriceMax?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
