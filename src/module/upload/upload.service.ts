import crypto from "crypto";
import fs from "fs";
import { StatusCodes } from "http-status-codes";
import AppError from "errors/AppError";
import {
  uploadToMinio,
  uploadFileToMinio,
  deleteFromMinio,
  resolveUrl,
} from "util/minio";
import { processImage, processSvg } from "util/imageProcessor";
import {
  IMAGE_KINDS,
  VIDEO_KINDS,
  contentTypeFor,
  extensionFor,
  sniffFile,
} from "util/fileSniff";
import { parseUploadKey, toStorageKey } from "util/uploadKey";

type UploadedTempFile = Pick<Express.Multer.File, "path" | "originalname" | "size">;

const removeTemp = async (filePath: string) => {
  await fs.promises.unlink(filePath).catch(() => undefined);
};

/** Profile / job / chat photos. SVG is accepted only from staff (category icons). */
const uploadImage = async (
  file: UploadedTempFile,
  userId: string,
  options: { isStaff?: boolean } = {},
) => {
  if (!file) throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");

  try {
    const kind = await sniffFile(file.path);

    if (kind === "svg") {
      if (!options.isStaff) {
        throw new AppError(StatusCodes.BAD_REQUEST, "SVG images are not allowed", {
          code: "SVG_NOT_ALLOWED",
        });
      }
      const raw = await fs.promises.readFile(file.path, "utf8");
      const processed = processSvg(raw, file.originalname);
      const key = `icons/${userId}/${processed.filename}`;
      await uploadToMinio(processed.buffer, key, processed.contentType);
      return { url: resolveUrl(key)!, key };
    }

    if (!IMAGE_KINDS.includes(kind)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Only JPEG, PNG and WebP images are allowed",
        { code: "INVALID_IMAGE" },
      );
    }

    const processed = await processImage({
      filePath: file.path,
      originalName: file.originalname,
      profile: "profile",
    });
    const key = `images/${userId}/${processed.filename}`;
    await uploadToMinio(processed.buffer, key, processed.contentType);
    return { url: resolveUrl(key)!, key };
  } finally {
    await removeTemp(file.path);
  }
};

/** ID cards / selfies: stored under the private `documents/` prefix. */
const uploadDocument = async (file: UploadedTempFile, userId: string) => {
  if (!file) throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");

  try {
    const kind = await sniffFile(file.path);
    if (!IMAGE_KINDS.includes(kind)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Please upload a photo (JPEG, PNG or WebP) of the document",
        { code: "INVALID_DOCUMENT" },
      );
    }

    const processed = await processImage({
      filePath: file.path,
      originalName: file.originalname,
      profile: "document",
    });
    const key = `documents/${userId}/${processed.filename}`;
    await uploadToMinio(processed.buffer, key, processed.contentType);
    return { url: resolveUrl(key)!, key };
  } finally {
    await removeTemp(file.path);
  }
};

/** Chat / support videos: streamed from disk to storage, never buffered in RAM. */
const uploadVideo = async (file: UploadedTempFile, userId: string) => {
  if (!file) throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");

  try {
    const kind = await sniffFile(file.path);
    if (!VIDEO_KINDS.includes(kind)) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Only MP4, MOV, 3GP, WebM and AVI videos are allowed",
        { code: "INVALID_VIDEO" },
      );
    }

    const safeName = file.originalname
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40);
    const filename = `${crypto.randomUUID().slice(0, 8)}-${safeName || "video"}${extensionFor(kind)}`;
    const key = `videos/${userId}/${filename}`;

    await uploadFileToMinio(file.path, key, contentTypeFor(kind));
    return { url: resolveUrl(key)!, key };
  } finally {
    await removeTemp(file.path);
  }
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when any record still points at this file. */
export const isKeyInUse = async (key: string): Promise<boolean> => {
  const tail = new RegExp(`${escapeRegex(key)}$`);

  const [{ User }, { Job }, { Message }, { SupportMessage }] = await Promise.all([
    import("module/user/user.model"),
    import("module/job/job.model"),
    import("module/chat/message.model"),
    import("module/support/support.model"),
  ]);

  const checks = await Promise.all([
    User.exists({
      $or: [
        { avatar: tail },
        { coverPhoto: tail },
        { documentUrl: tail },
        { selfieUrl: tail },
        { profilePhotos: tail },
      ],
    }),
    Job.exists({ images: tail }),
    Message.exists({ $or: [{ images: tail }, { video: tail }, { "offerData.images": tail }] }),
    SupportMessage.exists({ attachments: tail }),
  ]);
  return checks.some(Boolean);
};

/**
 * Delete a file. Allowed for its owner (the user id is part of the key) or
 * staff, and only while nothing references it — a job photo, KYC document or
 * chat attachment can never be pulled out from under a live record.
 */
const deleteFile = async (
  rawKey: string,
  requester: { userId: string; isStaff?: boolean },
) => {
  const key = toStorageKey(rawKey);
  const parsed = parseUploadKey(key);
  if (!parsed) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid file reference");
  }
  if (!requester.isStaff && parsed.owner !== String(requester.userId)) {
    throw new AppError(StatusCodes.FORBIDDEN, "You can only delete your own files");
  }
  if (await isKeyInUse(key)) {
    throw new AppError(
      StatusCodes.CONFLICT,
      "This file is still used and cannot be deleted",
      { code: "FILE_IN_USE" },
    );
  }
  await deleteFromMinio(key);
};

export const UploadService = {
  uploadImage,
  uploadDocument,
  uploadVideo,
  deleteFile,
  isKeyInUse,
};
