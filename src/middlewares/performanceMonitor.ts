import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { logger } from "../logger/logger";
import config from "config";
import redisClient from "../redis/redisClient";

interface LightMetric {
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: LightMetric[] = [];
  private readonly slowRequestThreshold = 1000;
  private readonly maxMetricsSize = 500;

  requestMonitor() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      res.on("finish", () => {
        const responseTime = Date.now() - startTime;

        this.addMetric({
          endpoint: req.route?.path || req.path,
          method: req.method,
          responseTime,
          statusCode: res.statusCode,
          timestamp: Date.now(),
        });

        if (responseTime > this.slowRequestThreshold) {
          logger.warn(`Slow request: ${req.method} ${req.path} took ${responseTime}ms`);
        }
      });

      next();
    };
  }

  addMetric(metric: LightMetric) {
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics = this.metrics.slice(-Math.floor(this.maxMetricsSize / 2));
    }
  }

  getStats(timeWindow = 3600000) {
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = this.metrics.filter((m) => m.timestamp > cutoff);

    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        slowRequests: 0,
        errorRate: 0,
        endpointStats: {},
      };
    }

    const totalRequests = recentMetrics.length;
    const averageResponseTime = Math.round(
      recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests,
    );
    const slowRequests = recentMetrics.filter(
      (m) => m.responseTime > this.slowRequestThreshold,
    ).length;
    const errorRequests = recentMetrics.filter((m) => m.statusCode >= 400).length;

    return {
      totalRequests,
      averageResponseTime,
      slowRequests,
      errorRate: Math.round((errorRequests / totalRequests) * 100),
    };
  }

  getSystemHealth() {
    const memoryUsage = process.memoryUsage();
    return {
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
    };
  }
}

export const performanceMonitor = new PerformanceMonitor();

export const healthCheck = async (_req: Request, res: Response) => {
  const systemHealth = performanceMonitor.getSystemHealth();

  let dbStatus = "unknown";
  try {
    dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  } catch {
    dbStatus = "error";
  }

  const redisStatus = !config.cache.enabled
    ? "disabled"
    : redisClient.isAvailable()
      ? "connected"
      : "disconnected";

  const status =
    dbStatus === "connected" &&
    systemHealth.memory.heapUsed < 500 &&
    (redisStatus === "connected" || redisStatus === "disabled")
      ? "healthy"
      : "degraded";

  res.status(status === "healthy" ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: systemHealth.uptime,
    database: dbStatus,
    redis: redisStatus,
  });
};

export const performanceDashboard = (_req: Request, res: Response) => {
  const stats = performanceMonitor.getStats();
  const systemHealth = performanceMonitor.getSystemHealth();

  res.json({
    performance: stats,
    system: systemHealth,
    timestamp: new Date().toISOString(),
  });
};

export const apiUsageTracker = (req: Request, _res: Response, next: NextFunction) => {
  const userAgent = req.get("User-Agent") || "unknown";
  const isBot = /bot|crawl|spider|scraper/i.test(userAgent);

  if (isBot) {
    logger.info(`Bot detected: ${userAgent} → ${req.path}`);
  }

  next();
};
