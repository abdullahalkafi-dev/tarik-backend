import { StatusCodes } from "http-status-codes";
import { Types } from "mongoose";
import AppError from "errors/AppError";
import { CategoryRepository } from "./category.repository";
import cacheService from "redis/cacheService";
import { buildCacheKey, buildCachePattern } from "redis/cache.utils";
import { resolveUrl } from "util/minio";
import { toStorageKey } from "util/uploadKey";

const CACHE_KEY = buildCacheKey("categories", "all");
const CACHE_TTL = 3600; // 1 hour

type TCategoryPricing = {
  minHourlyRate?: number | null;
  suggestedPriceMin?: number | null;
  suggestedPriceMax?: number | null;
};

type TCategoryInput = {
  name?: string;
  icon?: string;
  isActive?: boolean;
  names?: { en?: string; fr?: string; ar?: string; es?: string };
  sortOrder?: number;
  isPopular?: boolean;
} & TCategoryPricing;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeIcon = (icon?: string) => (icon ? toStorageKey(icon) : icon);

const invalidate = () => cacheService.invalidateByPattern(buildCachePattern("categories", "*"));

const create = async (payload: TCategoryInput & { name: string }) => {
  const exists = await CategoryRepository.exists({ name: payload.name });
  if (exists) {
    throw new AppError(StatusCodes.CONFLICT, "Category name already exists", { code: "CATEGORY_EXISTS" });
  }

  const slug = slugify(payload.name);
  if (slug && (await CategoryRepository.exists({ slug }))) {
    throw new AppError(StatusCodes.CONFLICT, "A category with a similar name already exists", {
      code: "CATEGORY_EXISTS",
    });
  }

  const category = await CategoryRepository.create({
    ...payload,
    icon: normalizeIcon(payload.icon),
    slug: slug || undefined,
    names: { en: payload.name, ...(payload.names || {}) },
  } as any);

  await invalidate();
  return category;
};

/** Name to display in the caller's language (falls back to English). */
const displayName = (obj: any, lang?: string) => {
  const l = String(lang || "").slice(0, 2).toLowerCase();
  return (l && obj.names?.[l]) || obj.names?.en || obj.name;
};

const formatCategory = (cat: any, lang?: string) => {
  const obj = cat.toObject ? cat.toObject() : { ...cat };
  return {
    ...obj,
    displayName: displayName(obj, lang),
    icon: resolveUrl(obj.icon),
  };
};

const getAll = async (lang?: string) => {
  const categories = await cacheService.getOrSet(
    CACHE_KEY,
    async () => {
      const docs = await CategoryRepository.findMany({ isActive: true }, { sort: { sortOrder: 1, name: 1 } });
      return docs.map((doc: any) => (doc.toObject ? doc.toObject() : doc));
    },
    CACHE_TTL,
  );
  return (categories || []).map((c: any) => formatCategory(c, lang));
};

const getAllAdmin = async () => {
  const docs = await CategoryRepository.findMany({}, { sort: { sortOrder: 1, name: 1 } });
  return docs.map((d: any) => formatCategory(d));
};

const getById = async (id: string, lang?: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(StatusCodes.NOT_FOUND, "Category not found");
  }
  const category = await CategoryRepository.findById(id);
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "Category not found");
  }
  return formatCategory(category, lang);
};

const update = async (id: string, payload: TCategoryInput) => {
  if (payload.name) {
    const exists = await CategoryRepository.findOne({
      name: payload.name,
      _id: { $ne: id },
    });
    if (exists) {
      throw new AppError(StatusCodes.CONFLICT, "Category name already exists", { code: "CATEGORY_EXISTS" });
    }
  }

  if (payload.suggestedPriceMin !== undefined || payload.suggestedPriceMax !== undefined) {
    // Check the merged range when only one end is being changed.
    const current = await CategoryRepository.findById(id);
    const min = payload.suggestedPriceMin !== undefined ? payload.suggestedPriceMin : current?.suggestedPriceMin;
    const max = payload.suggestedPriceMax !== undefined ? payload.suggestedPriceMax : current?.suggestedPriceMax;
    if (min != null && max != null && min > max) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Suggested minimum price cannot be higher than the maximum");
    }
  }

  const set: Record<string, unknown> = { ...payload };
  if (payload.icon !== undefined) set.icon = normalizeIcon(payload.icon);
  if (payload.names) {
    for (const [k, v] of Object.entries(payload.names)) set[`names.${k}`] = v;
    delete set.names;
  }

  const category = await CategoryRepository.updateById(id, set);
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "Category not found");
  }

  await invalidate();
  return category;
};

/**
 * A category that jobs or helper profiles still point to cannot be deleted —
 * that would leave them with an empty category and crash the apps. Switch it
 * off (isActive = false) instead: it disappears from the apps but history stays.
 */
const remove = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(StatusCodes.NOT_FOUND, "Category not found");
  }
  const [{ Job }, { User }] = await Promise.all([
    import("module/job/job.model"),
    import("module/user/user.model"),
  ]);
  const [jobs, helpers] = await Promise.all([
    Job.countDocuments({ category: id } as any),
    User.countDocuments({ serviceType: id } as any),
  ]);
  if (jobs > 0 || helpers > 0) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "This category is still used by jobs or helpers. Deactivate it instead of deleting it.",
      { code: "CATEGORY_IN_USE", params: { jobs, helpers } },
    );
  }

  const category = await CategoryRepository.deleteById(id);
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "Category not found");
  }

  await invalidate();
  return category;
};

/** Throws if an hourly `rate` is below the category's minimum hourly rate. */
const assertMinHourlyRate = async (categoryId: unknown, rate: unknown) => {
  const id = categoryId != null ? String((categoryId as any)?._id ?? categoryId) : "";
  if (!id || !Types.ObjectId.isValid(id) || rate == null) return;
  const category = await CategoryRepository.findById(id);
  const min = Number(category?.minHourlyRate) || 0;
  if (category && min > 0 && Number(rate) < min) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      `Minimum rate for ${category.name} is ${min} MAD/hour`,
      { code: "MIN_HOURLY_RATE", params: { category: category.name, min } },
    );
  }
};

export const CategoryService = {
  create,
  assertMinHourlyRate,
  getAll,
  getAllAdmin,
  getById,
  update,
  remove,
  slugify,
};
