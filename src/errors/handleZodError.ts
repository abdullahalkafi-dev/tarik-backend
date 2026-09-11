import { TErrorSources, TGenericErrorResponse } from "../types/error";
import z, { ZodError } from "zod";

const generateUserFriendlyMessage = (issue: z.core.$ZodIssue): string => {
  const fieldName = issue.path[issue.path.length - 1] || "Field";

  const formattedFieldName = String(fieldName)
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase()
    .replace(/^./, (str) => str.toUpperCase());

  switch (issue.code) {
    case "invalid_type": {
      if (issue.input === undefined || issue.input === null) {
        return `${formattedFieldName} is required`;
      }
      return `${formattedFieldName} must be a ${issue.expected}, but received ${typeof issue.input}`;
    }

    case "too_small": {
      const origin = issue.origin;
      if (origin === "string") {
        return `${formattedFieldName} must be at least ${issue.minimum} characters long`;
      }
      if (origin === "number" || origin === "bigint") {
        return `${formattedFieldName} must be at least ${issue.minimum}`;
      }
      if (origin === "array" || origin === "set") {
        return `${formattedFieldName} must contain at least ${issue.minimum} item(s)`;
      }
      return `${formattedFieldName} is too small (minimum: ${issue.minimum})`;
    }

    case "too_big": {
      const origin = issue.origin;
      if (origin === "string") {
        return `${formattedFieldName} must be at most ${issue.maximum} characters long`;
      }
      if (origin === "number" || origin === "bigint") {
        return `${formattedFieldName} must be at most ${issue.maximum}`;
      }
      if (origin === "array" || origin === "set") {
        return `${formattedFieldName} must contain at most ${issue.maximum} item(s)`;
      }
      return `${formattedFieldName} is too large (maximum: ${issue.maximum})`;
    }

    case "invalid_value":
      if ("values" in issue && Array.isArray(issue.values)) {
        return `${formattedFieldName} must be one of: ${issue.values.join(", ")}`;
      }
      return `${formattedFieldName} has an invalid value`;

    case "unrecognized_keys":
      return `Unrecognized field(s): ${(issue as { keys?: string[] }).keys?.join(", ")}`;

    case "custom":
      return issue.message || `${formattedFieldName} is invalid`;

    default:
      return `${formattedFieldName} is invalid`;
  }
};

const handleZodError = (err: ZodError): TGenericErrorResponse => {
  const errorSources: TErrorSources = err.issues.map((issue) => {
    const rawPath = issue.path[issue.path.length - 1];
    let path: string | number;

    if (typeof rawPath === "string" || typeof rawPath === "number") {
      path = rawPath;
    } else {
      path = "unknown";
    }

    return {
      path,
      message: generateUserFriendlyMessage(issue),
    };
  });

  const message =
    errorSources.length === 1 && errorSources[0]
      ? errorSources[0].message
      : errorSources.length === 2
        ? `Invalid input for ${errorSources.map((e) => e.path).join(" and ")}`
        : `${errorSources.length} validation errors found. Please check your input.`;

  return {
    statusCode: 400,
    message,
    errorSources,
  };
};

export default handleZodError;
