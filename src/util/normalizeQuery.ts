export const normalizeQuery = (query: Record<string, unknown>) => {
  return Object.keys(query)
    .sort()
    .reduce((obj, key) => {
      let value = query[key];
      if (value === undefined || value === null || value === "") {
        value = "";
      }
      if (typeof value === "string" && value.includes(",")) {
        value = value
          .split(",")
          .map((v) => v.trim())
          .sort()
          .join(",");
      }
      obj[key] = value;
      return obj;
    }, {} as Record<string, unknown>);
};
