import { Client as MinioClient } from "minio";
import { logger } from "../logger/logger";
import config from "../config";

let minioClient: MinioClient | null = null;

const getMinioClient = (): MinioClient => {
  if (!minioClient) {
    minioClient = new MinioClient({
      endPoint: config.minio.endpoint,
      port: config.minio.port,
      useSSL: config.minio.use_ssl,
      accessKey: config.minio.access_key,
      secretKey: config.minio.secret_key,
    });
  }
  return minioClient;
};

const BUCKET = config.minio.bucket;

export const ensureBucket = async (): Promise<void> => {
  const client = getMinioClient();
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    await client.makeBucket(BUCKET, "us-east-1");
    // Set public read policy for the bucket
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${BUCKET}/*`],
        },
      ],
    };
    await client.setBucketPolicy(BUCKET, JSON.stringify(policy));
    logger.info(`MinIO bucket "${BUCKET}" created with public read policy`);
  }
};

export const uploadToMinio = async (
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> => {
  const client = getMinioClient();
  await client.putObject(BUCKET, key, buffer, buffer.length, {
    "Content-Type": contentType,
  });
  return `${config.minio.public_url}/${BUCKET}/${key}`;
};

export const deleteFromMinio = async (key: string): Promise<void> => {
  const client = getMinioClient();
  await client.removeObject(BUCKET, key);
};

export const getMinioObjectStream = async (key: string) => {
  const client = getMinioClient();
  return client.getObject(BUCKET, key);
};

export const getMinioObjectStat = async (key: string) => {
  const client = getMinioClient();
  return client.statObject(BUCKET, key);
};

export const getMinioPublicUrl = (key: string): string => {
  const baseUrl = config.urls.api_base_url.replace(/\/+$/, "");
  return `${baseUrl}/api/v1/upload/files/${key}`;
};

/**
 * Resolve a stored value to a full URL.
 * - If value is null/undefined → returns null
 * - If value starts with "http" → legacy full URL, return as-is
 * - Otherwise → treat as MinIO key and construct backend proxy URL
 */
export const resolveUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const baseUrl = config.urls.api_base_url.replace(/\/+$/, "");

  // If URL contains MinIO bucket path (/tarik-uploads/), extract key and proxy via backend
  if (value.includes("/tarik-uploads/")) {
    const key = value.split("/tarik-uploads/")[1];
    return `${baseUrl}/api/v1/upload/files/${key}`;
  }

  // If URL already has backend upload path, ensure it uses active baseUrl
  if (value.includes("/api/v1/upload/files/")) {
    const key = value.split("/api/v1/upload/files/")[1];
    return `${baseUrl}/api/v1/upload/files/${key}`;
  }

  // If already a full URL, replace any localhost/127.0.0.1 with the configured API host
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        const baseParsed = new URL(baseUrl);
        parsed.hostname = baseParsed.hostname;
        return parsed.toString();
      }
    } catch (_) {
      // ignore parse errors and return value as-is
    }
    return value;
  }

  const cleanKey = value.startsWith("/") ? value.slice(1) : value;
  return `${baseUrl}/api/v1/upload/files/${cleanKey}`;
};

export { getMinioClient, BUCKET };
