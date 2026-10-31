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

const langOf = (req: any): string | undefined => {
  const q = typeof req.query.lang === "string" ? req.query.lang : "";
  const h = String(req.headers["accept-language"] || "").split(",")[0];
  return (q || h || "").slice(0, 2).toLowerCase() || undefined;
};

const getAll = catchAsync(async (req, res) => {
  const result = await CategoryService.getAll(langOf(req));

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
  const result = await CategoryService.getById(req.params.id as string, langOf(req));

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
