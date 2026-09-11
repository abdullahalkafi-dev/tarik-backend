const utilModuleName = "util";
const nodeUtil = require(utilModuleName) as {
  promisify: typeof import("node:util").promisify;
};

export const promisify = nodeUtil.promisify;
