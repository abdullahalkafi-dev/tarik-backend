import { TErrorSources } from "../types/error";

type TAppErrorOptions = {
  stack?: string;
  errorSources?: TErrorSources;
  details?: Record<string, unknown>;
  /** Stable machine-readable code (e.g. INSUFFICIENT_BALANCE) the apps can translate. */
  code?: string;
  /** Values to substitute into the translated message (e.g. { required: 60 }). */
  params?: Record<string, unknown>;
};

class AppError extends Error {
  public statusCode: number;
  public errorSources?: TErrorSources;
  public details?: Record<string, unknown>;
  public code?: string;
  public params?: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    options: string | TAppErrorOptions = "",
  ) {
    super(message);
    this.statusCode = statusCode;

    if (typeof options !== "string") {
      this.errorSources = options.errorSources;
      this.details = options.details;
      this.code = options.code;
      this.params = options.params;
    }

    const stack = typeof options === "string" ? options : (options.stack ?? "");

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default AppError;
