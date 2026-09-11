import { Request, Response, NextFunction } from "express";
import fs from "fs";
import { StatusCodes } from "http-status-codes";
import multer, { FileFilterCallback, MulterError } from "multer";
import path from "path";
import AppError from "../errors/AppError";
import sharp from "sharp";
import generateUploadFileName from "../util/generateUploadFileName";
import config from "../config";
import { logger } from "../logger/logger";

type UploadField = "image" | "media" | "video" | "audio" | "file";
type UploadFieldConfig = {
  folder: string;
  maxCount: number;
  forcedExtension?: string;
};
type UploadProfile = Partial<Record<UploadField, UploadFieldConfig>>;

const BASE_UPLOAD_DIR = path.join(process.cwd(), "uploads");

const mbToBytes = (mb: string | number): number => Number(mb) * 1024 * 1024;

const ensureDirExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const RECOGNIZED_UPLOAD_FIELDS = new Set<string>(["image", "media", "video", "audio", "file"]);
const isUploadField = (value: string): value is UploadField =>
  RECOGNIZED_UPLOAD_FIELDS.has(value);

const flattenUploadedFiles = (
  files: Record<string, Express.Multer.File[]> | Express.Multer.File[] | undefined,
): Express.Multer.File[] => {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
};

const cleanupFiles = (files: Express.Multer.File[]): void => {
  for (const file of files) {
    if (file.path) {
      fs.unlink(file.path, () => {});
    }
  }
};

const SINGLE_FILE_UPLOAD_PROFILE: UploadProfile = {
  image: { folder: "images", maxCount: 1, forcedExtension: ".tmp" },
  media: { folder: "medias", maxCount: 1 },
  video: { folder: "videos", maxCount: 1 },
};

const MULTI_FILE_UPLOAD_PROFILE: UploadProfile = {
  image: { folder: "images", maxCount: 10, forcedExtension: ".tmp" },
  video: { folder: "videos", maxCount: 10 },
  audio: { folder: "audios", maxCount: 10 },
  media: { folder: "medias", maxCount: 10 },
  file: { folder: "files", maxCount: 10 },
};

const ALLOWED_MIME_TYPES: Record<UploadField, Set<string>> = {
  image: new Set(["image/jpeg", "image/png", "image/jpg", "image/webp"]),
  media: new Set(["audio/mpeg", "audio/wav", "audio/aac", "video/mp4", "video/quicktime"]),
  video: new Set(["video/mp4", "video/quicktime", "video/webm"]),
  audio: new Set(["audio/mpeg", "audio/wav", "audio/aac", "audio/mp4"]),
  file: new Set<string>(),
};

const ALLOWED_MIME_MESSAGES: Record<UploadField, string> = {
  image: "Unsupported image type. Allowed: .jpeg, .png, .jpg, .webp",
  media: "Unsupported media type",
  video: "Unsupported video type. Allowed: .mp4, .mov, .webm",
  audio: "Unsupported audio type. Allowed: .mp3, .wav, .aac, .m4a",
  file: "",
};

const createFileUploadHandler = (fieldConfig: UploadProfile) => {
  const fileUploadHandler = (req: Request, res: Response, next: NextFunction) => {
    ensureDirExists(BASE_UPLOAD_DIR);

    const imageLimitMb = Number(config.upload.max_file_size_mb);
    const imageLimitBytes = mbToBytes(imageLimitMb);
    const globalLimitBytes = imageLimitBytes;

    const storage = multer.diskStorage({
      destination: (_req, file, cb) => {
        const cfg = isUploadField(file.fieldname) ? fieldConfig[file.fieldname] : undefined;
        if (!cfg) {
          cb(new AppError(StatusCodes.BAD_REQUEST, "File is not supported"), "");
          return;
        }
        const uploadDir = path.join(BASE_UPLOAD_DIR, cfg.folder);
        ensureDirExists(uploadDir);
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const cfg = isUploadField(file.fieldname) ? fieldConfig[file.fieldname] : undefined;
        if (!cfg) {
          cb(new AppError(StatusCodes.BAD_REQUEST, "This file is not supported"), "");
          return;
        }
        const extension = cfg.forcedExtension ?? path.extname(file.originalname).toLowerCase();
        const fileName = generateUploadFileName({
          originalName: file.originalname,
          userId: file.fieldname === "image" ? String(req.user?._id) : undefined,
        });
        cb(null, `${fileName}${extension}`);
      },
    });

    const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
      if (!isUploadField(file.fieldname) || !fieldConfig[file.fieldname]) {
        cb(new AppError(StatusCodes.BAD_REQUEST, "This file is not supported"));
        return;
      }

      if (file.fieldname === "file") {
        cb(null, true);
        return;
      }

      if (!ALLOWED_MIME_TYPES[file.fieldname]?.has(file.mimetype)) {
        cb(new AppError(StatusCodes.BAD_REQUEST, ALLOWED_MIME_MESSAGES[file.fieldname]));
        return;
      }

      cb(null, true);
    };

    const upload = multer({
      storage,
      fileFilter,
      limits: { fileSize: globalLimitBytes },
    }).fields(
      (Object.keys(fieldConfig) as UploadField[]).map((fieldName) => ({
        name: fieldName,
        maxCount: fieldConfig[fieldName]!.maxCount,
      })),
    );

    upload(req, res, async (err: unknown) => {
      const uploadedFiles = flattenUploadedFiles(
        req.files as Record<string, Express.Multer.File[]> | undefined,
      );

      if (!req.body) req.body = {};

      if (err) {
        cleanupFiles(uploadedFiles);

        if (err instanceof MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return next(new AppError(StatusCodes.BAD_REQUEST, `File too large. Max size: ${imageLimitMb}MB`));
          }
          if (err.code === "LIMIT_UNEXPECTED_FILE") {
            const allowed = Object.keys(fieldConfig).join(", ");
            return next(new AppError(StatusCodes.BAD_REQUEST, `Unexpected field "${err.field}". Allowed: ${allowed}`));
          }
          return next(new AppError(StatusCodes.BAD_REQUEST, err.message));
        }
        return next(err);
      }

      const imageFiles = (req.files as Record<string, Express.Multer.File[]> | undefined)?.image;
      if (!imageFiles?.length) return next();

      try {
        for (const file of imageFiles) {
          if (!file.path) continue;

          const inputBuffer = await fs.promises.readFile(file.path);
          if (!inputBuffer.length) continue;

          const newFilePath = path.join(
            path.dirname(file.path),
            `${path.parse(file.path).name}.webp`,
          );

          const outputInfo = await sharp(inputBuffer, { failOn: "none" })
            .rotate()
            .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 35, effort: 2 })
            .toFile(newFilePath);

          await fs.promises.unlink(file.path);

          file.path = newFilePath;
          file.filename = path.basename(newFilePath);
          file.mimetype = "image/webp";
          file.size = outputInfo.size;
        }
      } catch (sharpError) {
        logger.error("Sharp image processing failed", {
          error: sharpError instanceof Error ? sharpError.message : String(sharpError),
        });
        cleanupFiles(uploadedFiles);
        return next(
          new AppError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Image processing failed: ${sharpError instanceof Error ? sharpError.message : "unknown error"}`,
          ),
        );
      }

      next();
    });
  };

  return fileUploadHandler;
};

export const singleFileUploadHandler = createFileUploadHandler(SINGLE_FILE_UPLOAD_PROFILE);
export const multiFileUploadHandler = createFileUploadHandler(MULTI_FILE_UPLOAD_PROFILE);

const fileUploadHandler = singleFileUploadHandler;
export default fileUploadHandler;
