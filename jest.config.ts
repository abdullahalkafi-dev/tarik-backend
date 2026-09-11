import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  testTimeout: 120000,
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.jest.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@config/(.*)$": "<rootDir>/src/config/$1",
    "^@middlewares/(.*)$": "<rootDir>/src/middlewares/$1",
    "^@routes/(.*)$": "<rootDir>/src/routes/$1",
    "^@shared/(.*)$": "<rootDir>/src/shared/$1",
    "^@util/(.*)$": "<rootDir>/src/util/$1",
    "^@utils/(.*)$": "<rootDir>/src/util/$1",
    "^config$": "<rootDir>/src/config",
    "^middlewares/(.*)$": "<rootDir>/src/middlewares/$1",
    "^module/(.*)$": "<rootDir>/src/module/$1",
    "^shared/(.*)$": "<rootDir>/src/shared/$1",
    "^util/(.*)$": "<rootDir>/src/util/$1",
    "^redis/(.*)$": "<rootDir>/src/redis/$1",
    "^cacheService$": "<rootDir>/src/redis/cacheService",
    "^cache\\.utils$": "<rootDir>/src/redis/cache.utils",
    "^mail/(.*)$": "<rootDir>/src/mail/$1",
    "^errors/(.*)$": "<rootDir>/src/errors/$1",
    "^logger/(.*)$": "<rootDir>/src/logger/$1",
    "^jwt/(.*)$": "<rootDir>/src/jwt/$1",
    "^jwt$": "<rootDir>/src/jwt",
    "^Builder/(.*)$": "<rootDir>/src/Builder/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/__tests__/helpers/setup.ts"],
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
    "!src/server.ts",
    "!src/app.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
};

export default config;
