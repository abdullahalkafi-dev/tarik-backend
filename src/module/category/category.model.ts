import { Schema, model } from "mongoose";
import { TCategory } from "./category.interface";

const categorySchema = new Schema<TCategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    icon: { type: String },
    isActive: { type: Boolean, default: true },
    slug: { type: String, trim: true, lowercase: true },
    names: {
      en: { type: String, trim: true },
      fr: { type: String, trim: true },
      ar: { type: String, trim: true },
      es: { type: String, trim: true },
    },
    sortOrder: { type: Number, default: 100 },
    isPopular: { type: Boolean, default: false },
    // Price guidance shown to clients/helpers and enforced for hourly rates
    minHourlyRate: { type: Number, min: 0, default: null },
    suggestedPriceMin: { type: Number, min: 0, default: null },
    suggestedPriceMax: { type: Number, min: 0, default: null },
  },
  { timestamps: true },
);

categorySchema.index({ slug: 1 }, { unique: true, partialFilterExpression: { slug: { $type: "string" } } });

export const Category = model<TCategory>("Category", categorySchema);

export const syncCategoryIndexes = () => Category.syncIndexes();
