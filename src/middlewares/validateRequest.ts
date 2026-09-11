import { NextFunction, Request, Response } from "express";
import { ZodObject } from "zod";

const validateRequest =
  (schema: ZodObject) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    if (req.body?.data && typeof req.body.data === "string") {
      try {
        req.body.data = JSON.parse(req.body.data);
      } catch {
        return next(new Error("Invalid JSON in data field"));
      }
    }

    const cleanQuery = Object.fromEntries(
      Object.entries(req.query).filter(([, v]) => v !== ""),
    );

    try {
      await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: cleanQuery,
        cookies: req.cookies,
      });
      next();
    } catch (error) {
      next(error);
    }
  };

export default validateRequest;
