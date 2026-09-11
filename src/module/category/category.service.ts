import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { CategoryRepository } from "./category.repository";
import cacheService from "redis/cacheService";
import { buildCacheKey, buildCachePattern } from "redis/cache.utils";
import { resolveUrl } from "util/minio";

const CACHE_KEY = buildCacheKey("categories", "all");
const CACHE_TTL = 3600; // 1 hour

const create = async (payload: { name: string; icon?: string }) => {
  const exists = await CategoryRepository.exists({ name: payload.name });
  if (exists) {
    throw new AppError(StatusCodes.CONFLICT, "Category name already exists");
  }

  const category = await CategoryRepository.create(payload);

  // Invalidate cache
  await cacheService.invalidateByPattern(buildCachePattern("categories", "*"));

  return category;
};

const formatCategory = (cat: any) => {
  const obj = cat.toObject ? cat.toObject() : { ...cat };
  return {
    ...obj,
    icon: resolveUrl(obj.icon),
  };
};

const getAll = async () => {
  const categories = await cacheService.getOrSet(
    CACHE_KEY,
    async () => {
      const docs = await CategoryRepository.findMany({ isActive: true }, { sort: { name: 1 } });
      return docs.map((doc: any) => (doc.toObject ? doc.toObject() : doc));
    },
    CACHE_TTL,
  );
  return (categories || []).map(formatCategory);
};

const getAllAdmin = async () => {
  const docs = await CategoryRepository.findMany({}, { sort: { name: 1 } });
  return docs.map(formatCategory);
};

const getById = async (id: string) => {
  const category = await CategoryRepository.findById(id);
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "Category not found");
  }
  return formatCategory(category);
};

const update = async (id: string, payload: { name?: string; icon?: string; isActive?: boolean }) => {
  if (payload.name) {
    const exists = await CategoryRepository.findOne({
      name: payload.name,
      _id: { $ne: id },
    });
    if (exists) {
      throw new AppError(StatusCodes.CONFLICT, "Category name already exists");
    }
  }

  const category = await CategoryRepository.updateById(id, payload);
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "Category not found");
  }

  // Invalidate cache
  await cacheService.invalidateByPattern(buildCachePattern("categories", "*"));

  return category;
};

const remove = async (id: string) => {
  const category = await CategoryRepository.deleteById(id);
  if (!category) {
    throw new AppError(StatusCodes.NOT_FOUND, "Category not found");
  }

  // Invalidate cache
  await cacheService.invalidateByPattern(buildCachePattern("categories", "*"));

  return category;
};

export const CategoryService = {
  create,
  getAll,
  getAllAdmin,
  getById,
  update,
  remove,
};
