import { z } from "zod";
import globalErrorHandler from "../../src/middlewares/globalErrorHandler";
import AppError from "../../src/errors/AppError";

jest.mock("../../src/logger/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  errorLogger: { error: jest.fn() },
}));

const run = (err: unknown, language?: string) => {
  const res: any = { locals: {}, status: jest.fn().mockReturnThis(), json: jest.fn() };
  const req: any = { method: "POST", originalUrl: "/x", headers: language ? { "accept-language": language } : {} };
  globalErrorHandler(err, req, res, jest.fn());
  return res.json.mock.calls[0][0];
};

describe("error answers follow Accept-Language", () => {
  const zodError = () => {
    const r = z.object({ amount: z.number().min(30) }).safeParse({ amount: 5 });
    return (r as any).error;
  };

  it("a form error never stays English in the first errorSources line (the app shows that one)", () => {
    for (const lang of ["fr", "ar", "es"]) {
      const body = run(zodError(), lang);
      expect(body.errorSources[0].message).toBe(body.message);
      expect(body.errorSources[0].message).not.toMatch(/amount|Number must|greater than/i);
    }
  });

  it("English callers keep the detailed form text", () => {
    const body = run(zodError(), "en");
    expect(body.errorSources[0].message).toMatch(/amount|30|greater/i);
  });

  it("a known business message is translated, an unknown one is left alone", () => {
    const known = run(new AppError(409, "The helper has already arrived. Please report a problem so support can help."), "fr");
    expect(known.message).not.toMatch(/helper has already arrived/);
    const unknown = run(new AppError(400, "Some message nobody translated"), "fr");
    expect(unknown.message).toBe("Some message nobody translated");
  });
});
