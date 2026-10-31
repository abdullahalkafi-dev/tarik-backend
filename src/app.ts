import cors from "cors";
import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import router from "./routes";
import cookieParser from "cookie-parser";
import {
  helmetConfig,
  generalLimiter,
  compressionConfig,
  additionalSanitization,
} from "./middlewares/security";
import {
  performanceMonitor,
  healthCheck,
  livenessCheck,
  apiUsageTracker,
} from "./middlewares/performanceMonitor";
import config from "./config";
import cacheService from "./redis/cacheService";
import { buildCachePattern } from "./redis/cache.utils";
import { Morgan } from "./logger/morgan";
import globalErrorHandler from "./middlewares/globalErrorHandler";
import { requireAdminApiKey } from "./middlewares/adminApiKey";
import { getAllowedOrigins } from "./config/origins";

const app: express.Application = express();

// 1. Trust proxy
app.set("trust proxy", 1);

// 2. Security
app.use(helmetConfig);

// 3. CORS — one allow-list shared with Socket.IO (config/origins.ts).
// Set CORS_STRICT=true in production to reject unknown browser origins; the
// mobile apps send no Origin header and are never affected.
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = getAllowedOrigins();
      if (allowed.includes(origin) || allowed.includes("*")) return callback(null, true);
      return callback(null, !config.cors.strict);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Range"],
    exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
    credentials: true,
    maxAge: 86400,
  }),
);

// 4. Compression
app.use(compressionConfig);

// 5. Rate limiting
app.use(generalLimiter);

// 6. Body parsers
app.use(
  express.json({
    limit: "5mb",
    verify: (req: any, _res, buf, encoding) => {
      if ((req.originalUrl as string)?.includes("/webhook")) {
        req.rawBody = buf.toString((encoding as BufferEncoding) || "utf8");
      }
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(cookieParser());

// 7. Sanitization
app.use(additionalSanitization);

// 8. Performance monitoring
app.use(performanceMonitor.requestMonitor());
app.use(apiUsageTracker);

// 10. Health check
app.get("/health", healthCheck);
app.get("/health/ready", healthCheck);
app.get("/health/live", livenessCheck);

// 11. Root route
app.get("/", (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({ success: true, message: "Server is running" });
});

// 12. Morgan + Routes
app.use(Morgan.incomingRequestLogger);
app.use(Morgan.successHandler);
app.use(Morgan.errorHandler);

// 13. Cache clear endpoint (admin only)
app.post(
  "/api/v1/admin/cache/clear",
  requireAdminApiKey,
  async (_req: Request, res: Response) => {
    const cachePattern = buildCachePattern("*");
    const cleared = await cacheService.invalidateByPattern(cachePattern);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Cache cleared",
      data: { cleared },
    });
  },
);

// 14. API routes
app.use("/api/v1", router);

// 15. Global error handler
app.use(globalErrorHandler);

// 16. 404 handler
app.use((req: Request, res: Response) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: "Not found",
    errorMessages: [{ path: req.originalUrl, message: "API doesn't exist" }],
  });
});

export default app;
