import express, { Router } from "express";
import { AuthRoutes } from "../module/auth/auth.route";
import { UserRoutes } from "../module/user/user.route";
import { CategoryRoutes } from "../module/category/category.route";
import { UploadRoutes } from "../module/upload/upload.route";
import { GeocodingRoutes } from "../module/geocoding/geocoding.route";
import { JobRoutes } from "../module/job/job.route";
import { ChatRoutes } from "../module/chat/chat.route";
import { AdminRoutes } from "../module/admin/admin.route";
import { PaymentRoutes } from "../module/payment/payment.route";
import { WalletRoutes } from "../module/wallet/wallet.route";
import { SupportRoutes } from "../module/support/support.route";
import { ReviewRoutes } from "../module/review/review.route";
import { DiditRoutes } from "../module/didit/didit.route";
import { NotificationRoutes } from "../module/notification/notification.route";
import { LegalPublicRoutes } from "../module/settings/settings.route";
import { DiditController } from "../module/didit/didit.controller";

const router: Router = express.Router();

const webhookRouter: Router = express.Router();
webhookRouter.post("/didit", DiditController.handleWebhook);
webhookRouter.get("/didit", DiditController.handleCallback);

const apiRoutes = [
  { path: "/auth", route: AuthRoutes },
  { path: "/user", route: UserRoutes },
  { path: "/categories", route: CategoryRoutes },
  { path: "/upload", route: UploadRoutes },
  { path: "/geocoding", route: GeocodingRoutes },
  { path: "/jobs", route: JobRoutes },
  { path: "/chat", route: ChatRoutes },
  { path: "/admin", route: AdminRoutes },
  { path: "/payment", route: PaymentRoutes },
  { path: "/wallet", route: WalletRoutes },
  { path: "/support", route: SupportRoutes },
  { path: "/reviews", route: ReviewRoutes },
  { path: "/didit", route: DiditRoutes },
  { path: "/notifications", route: NotificationRoutes },
  { path: "/legal", route: LegalPublicRoutes },
  { path: "/webhooks", route: webhookRouter },
];

apiRoutes.forEach((route) => router.use(route.path, route.route));

export default router;
