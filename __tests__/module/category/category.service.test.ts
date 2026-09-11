import mongoose from "mongoose";

jest.mock("module/category/category.repository", () => ({
  CategoryRepository: {
    create: jest.fn(),
    findMany: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    updateById: jest.fn(),
    deleteById: jest.fn(),
    exists: jest.fn(),
  },
}));

jest.mock("redis/cacheService", () => ({
  __esModule: true,
  default: {
    getOrSet: jest.fn(),
    invalidateByPattern: jest.fn(),
  },
}));

jest.mock("redis/cache.utils", () => ({
  buildCacheKey: jest.fn().mockReturnValue("test:cache:key"),
  buildCachePattern: jest.fn().mockReturnValue("test:cache:pattern"),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CategoryRepository } = require("module/category/category.repository") as {
  CategoryRepository: {
    create: jest.Mock;
    findMany: jest.Mock;
    findById: jest.Mock;
    findOne: jest.Mock;
    updateById: jest.Mock;
    deleteById: jest.Mock;
    exists: jest.Mock;
  };
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cacheService = require("redis/cacheService").default as {
  getOrSet: jest.Mock;
  invalidateByPattern: jest.Mock;
};

import { CategoryService } from "module/category/category.service";

describe("CategoryService", () => {
  const categoryId = new mongoose.Types.ObjectId().toString();

  describe("create", () => {
    it("should create a category", async () => {
      const payload = { name: "Plumbing", icon: "🔧" };

      CategoryRepository.exists.mockResolvedValue(false);
      CategoryRepository.create.mockResolvedValue({
        _id: categoryId,
        ...payload,
        isActive: true,
      });
      cacheService.invalidateByPattern.mockResolvedValue(true);

      const result = await CategoryService.create(payload);

      expect(result).toEqual(
        expect.objectContaining({ name: "Plumbing", icon: "🔧" }),
      );
      expect(CategoryRepository.exists).toHaveBeenCalledWith({
        name: "Plumbing",
      });
      expect(CategoryRepository.create).toHaveBeenCalledWith(payload);
      expect(cacheService.invalidateByPattern).toHaveBeenCalled();
    });

    it("should throw 409 if category name already exists", async () => {
      CategoryRepository.exists.mockResolvedValue(true);

      await expect(
        CategoryService.create({ name: "Plumbing" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Category name already exists",
      });
    });
  });

  describe("getAll", () => {
    it("should return cached categories", async () => {
      const categories = [
        { _id: categoryId, name: "Plumbing", isActive: true },
      ];

      cacheService.getOrSet.mockResolvedValue(categories);

      const result = await CategoryService.getAll();

      expect(result).toEqual(categories);
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        "test:cache:key",
        expect.any(Function),
        3600,
      );
    });
  });

  describe("getById", () => {
    it("should return a category", async () => {
      const category = { _id: categoryId, name: "Plumbing", isActive: true };

      CategoryRepository.findById.mockResolvedValue(category);

      const result = await CategoryService.getById(categoryId);

      expect(result).toEqual(category);
      expect(CategoryRepository.findById).toHaveBeenCalledWith(categoryId);
    });

    it("should throw 404 if category not found", async () => {
      CategoryRepository.findById.mockResolvedValue(null);

      await expect(CategoryService.getById(categoryId)).rejects.toMatchObject({
        statusCode: 404,
        message: "Category not found",
      });
    });
  });

  describe("update", () => {
    it("should update a category", async () => {
      const payload = { name: "Updated Plumbing" };

      CategoryRepository.findOne.mockResolvedValue(null);
      CategoryRepository.updateById.mockResolvedValue({
        _id: categoryId,
        ...payload,
        isActive: true,
      });
      cacheService.invalidateByPattern.mockResolvedValue(true);

      const result = await CategoryService.update(categoryId, payload);

      expect(result).toEqual(
        expect.objectContaining({ name: "Updated Plumbing" }),
      );
      expect(CategoryRepository.findOne).toHaveBeenCalledWith({
        name: "Updated Plumbing",
        _id: { $ne: categoryId },
      });
    });

    it("should throw 409 if name already exists", async () => {
      CategoryRepository.findOne.mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        name: "Cleaning",
      });

      await expect(
        CategoryService.update(categoryId, { name: "Cleaning" }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Category name already exists",
      });
    });

    it("should throw 404 if category not found", async () => {
      CategoryRepository.findOne.mockResolvedValue(null);
      CategoryRepository.updateById.mockResolvedValue(null);

      await expect(
        CategoryService.update(categoryId, { name: "Test" }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message: "Category not found",
      });
    });

    it("should update without name validation when name not provided", async () => {
      CategoryRepository.updateById.mockResolvedValue({
        _id: categoryId,
        name: "Plumbing",
        icon: "🔧",
        isActive: true,
      });
      cacheService.invalidateByPattern.mockResolvedValue(true);

      const result = await CategoryService.update(categoryId, { icon: "🔧" });

      expect(result).toEqual(expect.objectContaining({ icon: "🔧" }));
      expect(CategoryRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("should delete a category", async () => {
      const category = { _id: categoryId, name: "Plumbing" };

      CategoryRepository.deleteById.mockResolvedValue(category);
      cacheService.invalidateByPattern.mockResolvedValue(true);

      const result = await CategoryService.remove(categoryId);

      expect(result).toEqual(category);
      expect(CategoryRepository.deleteById).toHaveBeenCalledWith(categoryId);
      expect(cacheService.invalidateByPattern).toHaveBeenCalled();
    });

    it("should throw 404 if category not found", async () => {
      CategoryRepository.deleteById.mockResolvedValue(null);

      await expect(CategoryService.remove(categoryId)).rejects.toMatchObject({
        statusCode: 404,
        message: "Category not found",
      });
    });
  });
});
