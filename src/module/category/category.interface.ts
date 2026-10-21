import { Types } from "mongoose";

export interface TCategory {
  _id: Types.ObjectId;
  name: string;
  icon?: string;
  isActive: boolean;
  // Price guidance (MAD). All optional; null/undefined = no guidance.
  minHourlyRate?: number | null;
  suggestedPriceMin?: number | null;
  suggestedPriceMax?: number | null;
  createdAt: Date;
  updatedAt: Date;
}
