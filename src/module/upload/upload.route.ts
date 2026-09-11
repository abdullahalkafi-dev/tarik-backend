import { Router } from "express";
import multer from "multer";
import auth from "@middlewares/auth";
import { UploadController } from "./upload.controller";

const router = Router();

// Multer memory storage for buffer-based uploads
const memoryStorage = multer.memoryStorage();

const imageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/jpg", "image/webp", "image/svg+xml"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, JPG, WebP, and SVG images are allowed"));
    }
  },
});

const documentUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ["image/jpeg", "image/png", "image/jpg", "image/webp", "application/pdf"];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, JPG, WebP, and PDF files are allowed"));
    }
  },
});

const videoUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 400 * 1024 * 1024 }, // 400MB
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "video/mp4",
      "video/quicktime",
      "video/x-msvideo",
      "video/x-ms-wmv",
      "video/webm",
      "video/3gpp",
      "video/x-matroska",
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only MP4, MOV, AVI, WMV, WebM, 3GP, MKV videos are allowed"));
    }
  },
});

/**
 * @route   POST /api/v1/upload/image
 * @desc    Upload profile/cover photo (compressed to WebP 75%)
 * @access  Private
 */
router.post(
  "/image",
  auth(),
  imageUpload.single("file"),
  UploadController.uploadImage,
);

/**
 * @route   POST /api/v1/upload/video
 * @desc    Upload video for chat messages (raw, no compression)
 * @access  Private
 */
router.post(
  "/video",
  auth(),
  videoUpload.single("file"),
  UploadController.uploadVideo,
);

/**
 * @route   POST /api/v1/upload/document
 * @desc    Upload ID/certificate document (WebP, no quality loss)
 * @access  Private
 */
router.post(
  "/document",
  auth(),
  documentUpload.single("file"),
  UploadController.uploadDocument,
);

/**
 * @route   GET /api/v1/upload/files/*key
 * @desc    Stream uploaded file from MinIO storage (public access with cache)
 * @access  Public
 */
router.get(
  "/files/*key",
  UploadController.getFile,
);

/**
 * @route   DELETE /api/v1/upload/*key
 * @desc    Delete uploaded file
 * @access  Private
 */
router.delete(
  "/*key",
  auth(),
  UploadController.deleteFile,
);

export const UploadRoutes = router;
