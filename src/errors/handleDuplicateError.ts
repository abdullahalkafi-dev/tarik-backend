import { TErrorSources, TGenericErrorResponse } from "../types/error";

const handleDuplicateError = (err: { message: string }): TGenericErrorResponse => {
  const match = err.message.match(/"([^"]*)"/);
  const extractedValue = match?.[1] || "Value";

  const errorSources: TErrorSources = [
    {
      path: "",
      message: `${extractedValue} already exists`,
    },
  ];

  return {
    statusCode: 400,
    message: "Duplicate entry",
    errorSources,
  };
};

export default handleDuplicateError;
