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
  apiUsageTracker,
} from "./middlewares/performanceMonitor";
import config from "./config";
import cacheService from "./redis/cacheService";
import { buildCachePattern } from "./redis/cache.utils";
import { Morgan } from "./logger/morgan";
import globalErrorHandler from "./middlewares/globalErrorHandler";
import { requireAdminApiKey } from "./middlewares/adminApiKey";

const app: express.Application = express();

// 1. Trust proxy
app.set("trust proxy", 1);

// 2. Security
app.use(helmetConfig);

// 3. CORS
const allowedOrigins =
  config.node_env === "production"
    ? ["https://yourdomain.com"]
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
      ];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
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

// 9. Static files
app.use("/uploads", express.static("uploads", { maxAge: "1d", etag: true, dotfiles: "deny" }));

// 10. Health check
app.get("/health", healthCheck);

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
