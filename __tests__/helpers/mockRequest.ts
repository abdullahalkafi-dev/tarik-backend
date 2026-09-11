import { Request } from "express";

export const mockRequest = (overrides: Partial<Request> = {}): Request => {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: undefined,
    ...overrides,
  } as Request;
};
