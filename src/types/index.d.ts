import * as express from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: any;
        email?: string;
        role?: string;
        isDeleted?: boolean;
        isBlocked?: boolean;
        [key: string]: any;
      };
      rawBody?: string;
    }
  }
}
