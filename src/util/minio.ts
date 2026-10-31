import { Client as MinioClient } from "minio";
import { logger } from "../logger/logger";
import config from "../config";
import { isPrivateKey, signFileKey } from "./uploadKey";

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

/**
 * Only avatars, job/chat photos, videos and category icons may be read
 * anonymously at MinIO level. Everything else (KYC `documents/`) has no public
 * rule: it is reachable only through the API with a signed link.
 */
const buildPublicReadPolicy = () => ({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: ["*"] },
      Action: ["s3:GetObject"],
      Resource: [
        `arn:aws:s3:::${BUCKET}/images/*`,
        `arn:aws:s3:::${BUCKET}/videos/*`,
        `arn:aws:s3:::${BUCKET}/icons/*`,
        `arn:aws:s3:::${BUCKET}/*.svg`,
      ],
    },
  ],
});

export const ensureBucket = async (): Promise<void> => {
  const client = getMinioClient();
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    await client.makeBucket(BUCKET, "us-east-1");
    logger.info(`MinIO bucket "${BUCKET}" created`);
  }
  // Re-applied on every start so an older "public for everything" policy is replaced.
  await client.setBucketPolicy(BUCKET, JSON.stringify(buildPublicReadPolicy()));
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

/** Upload from a file on disk without loading it into memory. */
export const uploadFileToMinio = async (
  filePath: string,
  key: string,
  contentType: string,
): Promise<string> => {
  const client = getMinioClient();
  await client.fPutObject(BUCKET, key, filePath, { "Content-Type": contentType });
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

/** Byte range of an object (HTTP Range support, needed by iOS video playback). */
export const getMinioPartialObject = async (key: string, offset: number, length: number) => {
  const client = getMinioClient();
  return client.getPartialObject(BUCKET, key, offset, length);
};

export const getMinioObjectStat = async (key: string) => {
  const client = getMinioClient();
  return client.statObject(BUCKET, key);
};

/** Lists object keys (and modification dates) under a prefix. */
export const listMinioObjects = (prefix: string) =>
  getMinioClient().listObjectsV2(BUCKET, prefix, true);

const fileUrl = (baseUrl: string, rawKey: string): string => {
  const key = rawKey.split("?")[0];
  const url = `${baseUrl}/api/v1/upload/files/${key}`;
  if (isPrivateKey(key)) {
    const { exp, sig } = signFileKey(key);
    return `${url}?exp=${exp}&sig=${sig}`;
  }
  return url;
};

export const getMinioPublicUrl = (key: string): string => {
  const baseUrl = config.urls.api_base_url.replace(/\/+$/, "");
  return fileUrl(baseUrl, key);
};

/**
 * Resolve a stored value to a full URL.
 * - null/undefined → null
 * - one of our keys or old storage URLs → API file URL (private files get a
 *   time-limited signature)
 * - any other http(s) URL (legacy) → returned as-is, localhost hosts rewritten
 */
export const resolveUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const baseUrl = config.urls.api_base_url.replace(/\/+$/, "");

  const bucketMarker = `/${BUCKET}/`;
  if (value.includes(bucketMarker)) {
    return fileUrl(baseUrl, value.split(bucketMarker)[1]);
  }

  if (value.includes("/api/v1/upload/files/")) {
    return fileUrl(baseUrl, value.split("/api/v1/upload/files/")[1]);
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      if (
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname.startsWith("192.168.")
      ) {
        const baseParsed = new URL(baseUrl);
        parsed.protocol = baseParsed.protocol;
        parsed.hostname = baseParsed.hostname;
        parsed.port = baseParsed.port;
        return parsed.toString();
      }
    } catch (_) {
      // ignore parse errors and return value as-is
    }
    return value;
  }

  const cleanKey = value.startsWith("/") ? value.slice(1) : value;
  return fileUrl(baseUrl, cleanKey);
};

export { getMinioClient, BUCKET };
