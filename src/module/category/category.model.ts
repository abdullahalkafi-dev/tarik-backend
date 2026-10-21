import { Schema, model } from "mongoose";
import { TCategory } from "./category.interface";

const categorySchema = new Schema<TCategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    icon: { type: String },
    isActive: { type: Boolean, default: true },
    // Price guidance shown to clients/helpers and enforced for hourly rates
    minHourlyRate: { type: Number, min: 0, default: null },
    suggestedPriceMin: { type: Number, min: 0, default: null },
    suggestedPriceMax: { type: Number, min: 0, default: null },
  },
  { timestamps: true },
);

export const Category = model<TCategory>("Category", categorySchema);

export const syncCategoryIndexes = () => Category.syncIndexes();
