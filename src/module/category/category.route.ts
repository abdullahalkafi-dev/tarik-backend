import { Router } from "express";
import auth from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { CategoryController } from "./category.controller";
import { CategoryDto } from "./category.dto";

const router = Router();

/**
 * @route   GET /api/v1/categories
 * @desc    Get all active categories
 * @access  Public
 */
router.get("/", CategoryController.getAll);

/**
 * @route   GET /api/v1/categories/all
 * @desc    Get all categories (admin)
 * @access  Private (Admin)
 */
router.get("/all", auth("admin", "superAdmin"), CategoryController.getAllAdmin);

/**
 * @route   GET /api/v1/categories/:id
 * @desc    Get category by ID
 * @access  Public
 */
router.get("/:id", CategoryController.getById);

/**
 * @route   POST /api/v1/categories
 * @desc    Create a category
 * @access  Private (Admin)
 */
router.post(
  "/",
  auth("admin", "superAdmin"),
  validateRequest(CategoryDto.create),
  CategoryController.create,
);

/**
 * @route   PATCH /api/v1/categories/:id
 * @desc    Update a category
 * @access  Private (Admin)
 */
router.patch(
  "/:id",
  auth("admin", "superAdmin"),
  validateRequest(CategoryDto.update),
  CategoryController.update,
);

/**
 * @route   DELETE /api/v1/categories/:id
 * @desc    Delete a category
 * @access  Private (Admin)
 */
router.delete(
  "/:id",
  auth("admin", "superAdmin"),
  CategoryController.remove,
);

export const CategoryRoutes = router;
