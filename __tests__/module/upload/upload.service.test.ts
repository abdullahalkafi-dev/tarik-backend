import mongoose from "mongoose";
import { UploadService } from "module/upload/upload.service";
import AppError from "errors/AppError";

jest.mock("util/minio", () => ({
  uploadToMinio: jest.fn(),
  deleteFromMinio: jest.fn(),
  resolveUrl: jest.fn((key: string) => `http://localhost:5000/api/v1/upload/files/${key}`),
}));

jest.mock("util/imageProcessor", () => ({
  processImage: jest.fn(),
}));

const { uploadToMinio, deleteFromMinio, resolveUrl } = require("util/minio");
const { processImage } = require("util/imageProcessor");

describe("UploadService", () => {
  const userId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("uploadFile", () => {
    const mockFile = {
      buffer: Buffer.from("test-file-content"),
      originalname: "photo.jpg",
      mimetype: "image/jpeg",
    } as Express.Multer.File;

    it("should process and upload an image", async () => {
      const processedResult = {
        buffer: Buffer.from("processed-image"),
        filename: "abc12345-photo.webp",
        contentType: "image/webp",
      };

      (processImage as jest.Mock).mockResolvedValue(processedResult);
      (uploadToMinio as jest.Mock).mockResolvedValue(
        "https://minio.example.com/bucket/images/user123/abc12345-photo.webp",
      );

      const result = await UploadService.uploadFile(mockFile, "image", userId);

      expect(result).toEqual({
        url: `http://localhost:5000/api/v1/upload/files/images/${userId}/abc12345-photo.webp`,
        key: `images/${userId}/abc12345-photo.webp`,
      });
      expect(processImage).toHaveBeenCalledWith({
        buffer: mockFile.buffer,
        originalName: "photo.jpg",
        profile: "profile",
      });
      expect(uploadToMinio).toHaveBeenCalledWith(
        processedResult.buffer,
        `images/${userId}/abc12345-photo.webp`,
        "image/webp",
      );
    });

    it("should process and upload a document", async () => {
      const docFile = {
        buffer: Buffer.from("doc-content"),
        originalname: "id-card.png",
        mimetype: "image/png",
      } as Express.Multer.File;

      const processedResult = {
        buffer: Buffer.from("processed-doc"),
        filename: "xyz98765-id-card.webp",
        contentType: "image/webp",
      };

      (processImage as jest.Mock).mockResolvedValue(processedResult);

      const result = await UploadService.uploadFile(docFile, "document", userId);

      expect(result).toEqual({
        url: `http://localhost:5000/api/v1/upload/files/documents/${userId}/xyz98765-id-card.webp`,
        key: `documents/${userId}/xyz98765-id-card.webp`,
      });
      expect(processImage).toHaveBeenCalledWith({
        buffer: docFile.buffer,
        originalName: "id-card.png",
        profile: "document",
      });
    });

    it("should throw 400 if no file provided", async () => {
      await expect(
        UploadService.uploadFile(undefined as any, "image", userId),
      ).rejects.toThrow(AppError);
      await expect(
        UploadService.uploadFile(undefined as any, "image", userId),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "No file provided",
      });
    });

    it("should throw 400 if file is null", async () => {
      await expect(
        UploadService.uploadFile(null as any, "image", userId),
      ).rejects.toThrow(AppError);
    });
  });

  describe("deleteFile", () => {
    it("should delete a file from minio", async () => {
      const key = "images/user123/photo.webp";
      (deleteFromMinio as jest.Mock).mockResolvedValue(undefined);

      await UploadService.deleteFile(key);

      expect(deleteFromMinio).toHaveBeenCalledWith(key);
      expect(deleteFromMinio).toHaveBeenCalledTimes(1);
    });

    it("should propagate minio errors", async () => {
      (deleteFromMinio as jest.Mock).mockRejectedValue(
        new Error("Minio connection failed"),
      );

      await expect(UploadService.deleteFile("bad-key")).rejects.toThrow(
        "Minio connection failed",
      );
    });
  });
});
