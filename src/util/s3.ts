import {
  S3Client,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import config from "../config";

const s3Client = new S3Client({
  region: config.aws_s3.region,
  credentials: {
    accessKeyId: config.aws_s3.access_key_id as string,
    secretAccessKey: config.aws_s3.secret_access_key as string,
  },
});

const BUCKET = config.aws_s3.bucket;

export const s3FileName = (originalName: string): string => {
  const ext = path.extname(originalName).toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
};

export const s3Keys = {
  userProfile: (userId: string, filename: string) => `users/${userId}/profile/${filename}`,
  userCover: (userId: string, filename: string) => `users/${userId}/cover/${filename}`,
  uploadImage: (filename: string) => `uploads/images/${filename}`,
};

export const uploadToS3 = async (
  localPath: string,
  s3Key: string,
  contentType: string,
): Promise<string> => {
  const fileStream = fs.createReadStream(localPath);
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: BUCKET,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();
  return `https://${BUCKET}.s3.${config.aws_s3.region}.amazonaws.com/${s3Key}`;
};

export const buildS3PublicUrl = (s3Key: string): string =>
  `https://${BUCKET}.s3.${config.aws_s3.region}.amazonaws.com/${s3Key}`;

export const deleteFromS3 = async (s3Key: string): Promise<void> => {
  try {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }),
    );
  } catch {
    console.error(`[S3] Failed to delete key: ${s3Key}`);
  }
};

export const listS3ObjectsByPrefix = async (prefix: string, maxKeys = 1000): Promise<string[]> => {
  const response = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: maxKeys,
    }),
  );

  return (response.Contents ?? [])
    .map((item) => item.Key)
    .filter((key): key is string => !!key && !key.endsWith("/"));
};
