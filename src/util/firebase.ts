import * as admin from "firebase-admin";
import config from "../config";
import { logger } from "../logger/logger";

let app: admin.app.App | null = null;

export const FCM_ANDROID_CHANNEL_ID = "high_importance_channel";

const getApp = (): admin.app.App | null => {
  if (app) return app;

  const serviceAccount = config.firebase.service_account_json;
  if (!serviceAccount) {
    logger.warn("Firebase env vars not set — FCM push notifications disabled");
    return null;
  }

  try {
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    logger.info("Firebase Admin SDK initialised successfully");
  } catch (err) {
    logger.error("Failed to initialise Firebase Admin SDK", err);
    return null;
  }

  return app;
};

getApp();

/** FCM requires all data map values to be strings. */
const sanitizeData = (data?: Record<string, unknown>): Record<string, string> => {
  if (!data) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return out;
};

export type FcmSendResult = {
  success: boolean;
  /** Present when the token is permanently invalid and should be cleared. */
  invalidToken?: boolean;
};

export const sendFCMNotification = async (
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<FcmSendResult> => {
  const firebaseApp = getApp();
  if (!firebaseApp) {
    logger.warn("[FCM] send skipped — Firebase Admin not initialised", {
      title,
    });
    return { success: false };
  }

  const collapseKey =
    String(data?.type || data?.jobId || data?.conversationId || "tarik");

  try {
    await admin.messaging(firebaseApp).send({
      token: deviceToken,
      notification: { title, body },
      data: sanitizeData(data),
      android: {
        // Collapse same-event pushes so retries don't queue behind old ones.
        collapseKey,
        priority: "high",
        // Expire quickly so FCM does not store-and-forward stale pushes.
        ttl: 0,
        notification: {
          sound: "default",
          channelId: FCM_ANDROID_CHANNEL_ID,
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default", badge: 1, "content-available": 1 } },
      },
    });
    logger.info("[FCM] send OK", { title });
    return { success: true };
  } catch (err: unknown) {
    const code =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    const invalidToken =
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token";

    logger.warn("[FCM] send failed", {
      deviceToken: deviceToken.slice(0, 10) + "...",
      code,
      invalidToken,
      title,
      err: err instanceof Error ? err.message : String(err),
    });
    return { success: false, invalidToken };
  }
};

export const sendFCMMulticast = async (
  deviceTokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<{ invalidTokens: string[] }> => {
  const invalidTokens: string[] = [];
  if (!deviceTokens.length) return { invalidTokens };

  const firebaseApp = getApp();
  if (!firebaseApp) return { invalidTokens };

  const collapseKey = String(data?.type || data?.jobId || "tarik");

  const CHUNK_SIZE = 500;
  const chunks: string[][] = [];
  for (let i = 0; i < deviceTokens.length; i += CHUNK_SIZE) {
    chunks.push(deviceTokens.slice(i, i + CHUNK_SIZE));
  }

  try {
    const results = await Promise.all(
      chunks.map((tokens) =>
        admin.messaging(firebaseApp).sendEachForMulticast({
          tokens,
          notification: { title, body },
          data: sanitizeData(data),
          android: {
            collapseKey,
            priority: "high",
            ttl: 0,
            notification: {
              sound: "default",
              channelId: FCM_ANDROID_CHANNEL_ID,
              clickAction: "FLUTTER_NOTIFICATION_CLICK",
            },
          },
          apns: {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default", badge: 1, "content-available": 1 } },
          },
        }),
      ),
    );

    results.forEach((result, chunkIndex) => {
      result.responses.forEach((response, i) => {
        if (!response.success) {
          const code = response.error?.code || "";
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            invalidTokens.push(chunks[chunkIndex][i]);
          }
        }
      });
    });
  } catch (err) {
    logger.warn("FCM multicast failed", { err });
  }

  return { invalidTokens };
};
