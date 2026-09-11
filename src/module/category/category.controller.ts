import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import { CategoryService } from "./category.service";

const create = catchAsync(async (req, res) => {
  const result = await CategoryService.create(req.body);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Category created successfully",
    data: result,
  });
});

const getAll = catchAsync(async (_req, res) => {
  const result = await CategoryService.getAll();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Categories fetched successfully",
    data: result,
  });
});

const getAllAdmin = catchAsync(async (_req, res) => {
  const result = await CategoryService.getAllAdmin();

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Categories fetched successfully",
    data: result,
  });
});

const getById = catchAsync(async (req, res) => {
  const result = await CategoryService.getById(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Category fetched successfully",
    data: result,
  });
});

const update = catchAsync(async (req, res) => {
  const result = await CategoryService.update(req.params.id as string, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Category updated successfully",
    data: result,
  });
});

const remove = catchAsync(async (req, res) => {
  const result = await CategoryService.remove(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Category deleted successfully",
    data: result,
  });
});

export const CategoryController = {
  create,
  getAll,
  getAllAdmin,
  getById,
  update,
  remove,
};
