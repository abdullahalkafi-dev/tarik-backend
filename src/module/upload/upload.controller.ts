import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import AppError from "errors/AppError";
import { UploadService } from "./upload.service";
import { getMinioObjectStream, getMinioObjectStat } from "util/minio";

const uploadImage = catchAsync(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");
  }

  const result = await UploadService.uploadFile(
    file,
    "image",
    req.user?._id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Image uploaded successfully",
    data: result,
  });
});

const uploadVideo = catchAsync(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");
  }

  const result = await UploadService.uploadVideo(
    file,
    req.user?._id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Video uploaded successfully",
    data: result,
  });
});

const uploadDocument = catchAsync(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");
  }

  const result = await UploadService.uploadFile(
    file,
    "document",
    req.user?._id as string,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Document uploaded successfully",
    data: result,
  });
});

const deleteFile = catchAsync(async (req, res) => {
  const rawKey = (req.params as any)[0] ?? (req.params as any).key ?? "";
  const keyStr = Array.isArray(rawKey) ? rawKey.join("/") : String(rawKey);
  const decodedKey = decodeURIComponent(keyStr).replace(/^\/+/, "");

  await UploadService.deleteFile(decodedKey);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "File deleted successfully",
    data: null,
  });
});

const getFile = catchAsync(async (req, res) => {
  // Catch either wildcard param (req.params[0]) or named param (req.params.key)
  const rawKey = (req.params as any)[0] ?? (req.params as any).key ?? "";
  const keyStr = Array.isArray(rawKey) ? rawKey.join("/") : String(rawKey);
  const key = decodeURIComponent(keyStr).replace(/^\/+/, "");

  if (!key) {
    throw new AppError(StatusCodes.BAD_REQUEST, "File key is required");
  }

  try {
    const stat = await getMinioObjectStat(key);
    const stream = await getMinioObjectStream(key);

    const ext = key.split(".").pop()?.toLowerCase() || "";
    const mimeTypes: Record<string, string> = {
      webp: "image/webp",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      svg: "image/svg+xml",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      m4v: "video/x-m4v",
      pdf: "application/pdf",
    };

    const contentType =
      (stat.metaData && stat.metaData["content-type"]) ||
      mimeTypes[ext] ||
      "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    // Must be embeddable from dashboard origin as <img> / <video>
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Disposition", "inline");

    if (stat.size) {
      res.setHeader("Content-Length", stat.size);
    }
    if (stat.etag) {
      res.setHeader("ETag", stat.etag);
    }

    // Set high performance client and CDN cache headers
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    stream.pipe(res);
  } catch (error: any) {
    if (error.code === "NotFound" || error.message?.includes("Not Found")) {
      throw new AppError(StatusCodes.NOT_FOUND, "File not found");
    }
    throw error;
  }
});

export const UploadController = {
  uploadImage,
  uploadVideo,
  uploadDocument,
  deleteFile,
  getFile,
};
