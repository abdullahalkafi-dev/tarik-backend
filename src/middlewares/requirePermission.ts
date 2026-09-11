import { NextFunction, Request, Response } from "express";
import AppError from "../errors/AppError";
import { StatusCodes } from "http-status-codes";

const requirePermission = (_permission: string) => {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next(new AppError(StatusCodes.NOT_IMPLEMENTED, "Staff permissions not implemented"));
  };
};

export default requirePermission;
