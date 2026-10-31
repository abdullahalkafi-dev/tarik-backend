import { StatusCodes } from "http-status-codes";
import catchAsync from "@shared/catchAsync";
import sendResponse from "@shared/sendResponse";
import AppError from "errors/AppError";
import { UploadService } from "./upload.service";
import {
  getMinioObjectStream,
  getMinioObjectStat,
  getMinioPartialObject,
} from "util/minio";
import { isPrivateKey, verifyFileSignature } from "util/uploadKey";

const STAFF_ROLES = ["admin", "superAdmin", "staff"];

const isStaffUser = (req: any): boolean => STAFF_ROLES.includes(req.user?.role);

const uploadImage = catchAsync(async (req, res) => {
  const file = req.file;
  if (!file) {
    throw new AppError(StatusCodes.BAD_REQUEST, "No file provided");
  }

  // SVG icons are an admin-only feature: it needs the category permission.
  const perms: string[] = (req.user as any)?.permissions || [];
  const canUploadIcons =
    isStaffUser(req) &&
    ((req.user as any)?.isSuperAdmin || perms.includes("*") || perms.includes("categories.manage"));

  const result = await UploadService.uploadImage(file, req.user?._id as string, {
    isStaff: canUploadIcons,
  });

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

  const result = await UploadService.uploadVideo(file, req.user?._id as string);

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

  const result = await UploadService.uploadDocument(file, req.user?._id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Document uploaded successfully",
    data: result,
  });
});

const keyFromParams = (req: any): string => {
  const rawKey = req.params[0] ?? req.params.key ?? "";
  const keyStr = Array.isArray(rawKey) ? rawKey.join("/") : String(rawKey);
  return decodeURIComponent(keyStr).replace(/^\/+/, "");
};

const deleteFile = catchAsync(async (req, res) => {
  await UploadService.deleteFile(keyFromParams(req), {
    userId: String(req.user?._id),
    isStaff: isStaffUser(req),
  });

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "File deleted successfully",
    data: null,
  });
});

const MIME_BY_EXT: Record<string, string> = {
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
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
  pdf: "application/pdf",
};

const getFile = catchAsync(async (req, res) => {
  const key = keyFromParams(req);

  if (!key || key.includes("..")) {
    throw new AppError(StatusCodes.BAD_REQUEST, "File key is required");
  }

  // Private files (KYC documents) only open with a valid, unexpired signature
  // that the API put into the response of an authorised request.
  const priv = isPrivateKey(key);
  if (priv && !verifyFileSignature(key, req.query.exp, req.query.sig)) {
    throw new AppError(StatusCodes.FORBIDDEN, "This link has expired or is not valid");
  }

  try {
    const stat = await getMinioObjectStat(key);
    const size = Number(stat.size) || 0;

    const ext = key.split(".").pop()?.toLowerCase() || "";
    // Never trust stored metadata for the content type of something served inline.
    const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Accept-Ranges", "bytes");
    // Allow the dashboard (other origin) to embed images / video.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (ext === "svg") {
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    res.setHeader("Content-Disposition", ext === "pdf" ? "attachment" : "inline");
    if (stat.etag) res.setHeader("ETag", stat.etag);
    res.setHeader(
      "Cache-Control",
      priv ? "private, max-age=3600" : "public, max-age=31536000, immutable",
    );

    // HTTP Range (iOS AVPlayer refuses to play or seek a video without it).
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
    if (range && size > 0) {
      let start = range[1] === "" ? NaN : parseInt(range[1], 10);
      let end = range[2] === "" ? NaN : parseInt(range[2], 10);

      if (Number.isNaN(start) && !Number.isNaN(end)) {
        // suffix range: last N bytes
        start = Math.max(size - end, 0);
        end = size - 1;
      } else if (!Number.isNaN(start) && Number.isNaN(end)) {
        end = size - 1;
      }

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`);
        res.end();
        return;
      }
      end = Math.min(end, size - 1);

      const partial = await getMinioPartialObject(key, start, end - start + 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", end - start + 1);
      partial.on("error", () => res.destroy());
      partial.pipe(res);
      return;
    }

    if (size) res.setHeader("Content-Length", size);
    const stream = await getMinioObjectStream(key);
    stream.on("error", () => res.destroy());
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
