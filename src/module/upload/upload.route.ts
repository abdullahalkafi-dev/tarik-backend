import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { Router } from "express";
import multer from "multer";
import auth from "@middlewares/auth";
import { uploadLimiter } from "@middlewares/security";
import { UploadController } from "./upload.controller";

const router = Router();

// Uploads are written to a temp file (never held in RAM) and removed after
// processing. The real file type is checked from the bytes, not the client header.
const TMP_DIR = path.join(os.tmpdir(), "tarik-uploads");
fs.mkdirSync(TMP_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
});

const imageUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB
});

const documentUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }, // 15 MB
});

const videoUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 }, // 50 MB (the app compresses before upload)
});

/**
 * @route   POST /api/v1/upload/image
 * @desc    Upload profile/job/chat photo (re-encoded to WebP)
 * @access  Private
 */
router.post("/image", auth(), uploadLimiter, imageUpload.single("file"), UploadController.uploadImage);

/**
 * @route   POST /api/v1/upload/video
 * @desc    Upload a video for chat / support (max 50 MB)
 * @access  Private
 */
router.post("/video", auth(), uploadLimiter, videoUpload.single("file"), UploadController.uploadVideo);

/**
 * @route   POST /api/v1/upload/document
 * @desc    Upload an ID / selfie photo (private storage, signed links only)
 * @access  Private
 */
router.post(
  "/document",
  auth(),
  uploadLimiter,
  documentUpload.single("file"),
  UploadController.uploadDocument,
);

/**
 * @route   GET /api/v1/upload/files/*key
 * @desc    Stream an uploaded file (Range supported). Private files need a signed link.
 * @access  Public (signed for private files)
 */
router.get("/files/*key", UploadController.getFile);

/**
 * @route   DELETE /api/v1/upload/*key
 * @desc    Delete one of your own files that nothing references any more
 * @access  Private
 */
router.delete("/*key", auth(), UploadController.deleteFile);

export const UploadRoutes = router;
