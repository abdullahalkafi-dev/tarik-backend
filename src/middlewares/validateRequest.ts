import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { ZodObject } from "zod";
import AppError from "../errors/AppError";

const validateRequest =
  (schema: ZodObject) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    if (req.body?.data && typeof req.body.data === "string") {
      try {
        req.body.data = JSON.parse(req.body.data);
      } catch {
        return next(new AppError(StatusCodes.BAD_REQUEST, "Invalid JSON in data field"));
      }
    }

    const cleanQuery = Object.fromEntries(
      Object.entries(req.query).filter(([, v]) => v !== ""),
    );

    try {
      const parsed = (await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: cleanQuery,
        cookies: req.cookies,
      })) as { body?: unknown; params?: unknown };

      // Hand the validated values to the controllers: trimming, coercion and
      // schema defaults only take effect if they are written back. Keys the
      // schema does not know are kept (they are handled by each service), so
      // adding this can never drop a field a controller still reads.
      if (parsed && typeof parsed.body === "object" && parsed.body !== null && !Array.isArray(parsed.body)) {
        req.body = { ...(req.body || {}), ...(parsed.body as Record<string, unknown>) };
      }
      if (parsed && typeof parsed.params === "object" && parsed.params !== null) {
        Object.assign(req.params, parsed.params as Record<string, string>);
      }
      next();
    } catch (error) {
      next(error);
    }
  };

export default validateRequest;
