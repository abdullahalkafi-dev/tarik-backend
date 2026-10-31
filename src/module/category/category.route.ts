import { Router } from "express";
import auth, { requirePermission } from "@middlewares/auth";
import validateRequest from "@middlewares/validateRequest";
import { CategoryController } from "./category.controller";
import { CategoryDto } from "./category.dto";

const router = Router();

const staff = auth("admin", "superAdmin", "staff");
const canEdit = requirePermission("categories.manage");

/**
 * @route   GET /api/v1/categories
 * @desc    Get all active categories (names in ?lang= / Accept-Language)
 * @access  Public
 */
router.get("/", CategoryController.getAll);

/**
 * @route   GET /api/v1/categories/all
 * @desc    Get all categories including inactive (admin)
 * @access  Private (staff)
 */
router.get("/all", staff, CategoryController.getAllAdmin);

/**
 * @route   GET /api/v1/categories/:id
 * @desc    Get category by ID
 * @access  Public
 */
router.get("/:id", CategoryController.getById);

/**
 * @route   POST /api/v1/categories
 * @desc    Create a category
 * @access  Private (staff, categories.manage)
 */
router.post("/", staff, canEdit, validateRequest(CategoryDto.create), CategoryController.create);

/**
 * @route   PATCH /api/v1/categories/:id
 * @desc    Update a category
 * @access  Private (staff, categories.manage)
 */
router.patch("/:id", staff, canEdit, validateRequest(CategoryDto.update), CategoryController.update);

/**
 * @route   DELETE /api/v1/categories/:id
 * @desc    Delete an UNUSED category (used ones must be deactivated instead)
 * @access  Private (staff, categories.manage)
 */
router.delete("/:id", staff, canEdit, CategoryController.remove);

export const CategoryRoutes = router;
