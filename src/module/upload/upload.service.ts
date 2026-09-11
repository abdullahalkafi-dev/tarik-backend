import crypto from "crypto";
import path from "path";
import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import { uploadToMinio, deleteFromMinio, resolveUrl } from "util/minio";
import { processImage } from "util/imageProcessor";

type UploadType = "image" | "document";

const uploadFile = async (
  file: Express.Multer.File,
  type: UploadType,
  userId: string,
) => {
  if (!file) {
    throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");
  }

  const profile = type === "image" ? "profile" : "document";

  const processed = await processImage({
    buffer: file.buffer,
    originalName: file.originalname,
    profile,
  });

  const key = `${type}s/${userId}/${processed.filename}`;
  await uploadToMinio(processed.buffer, key, processed.contentType);
  const url = resolveUrl(key)!;

  return { url, key };
};

const uploadVideo = async (
  file: Express.Multer.File,
  userId: string,
) => {
  if (!file) {
    throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");
  }

  const ext = path.extname(file.originalname) || ".mp4";
  const safeName = file.originalname
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
  const filename = `${crypto.randomUUID().slice(0, 8)}-${safeName}${ext}`;
  const key = `videos/${userId}/${filename}`;

  await uploadToMinio(file.buffer, key, file.mimetype);
  const url = resolveUrl(key)!;

  return { url, key };
};

const deleteFile = async (key: string) => {
  await deleteFromMinio(key);
};

export const UploadService = {
  uploadFile,
  uploadVideo,
  deleteFile,
};
