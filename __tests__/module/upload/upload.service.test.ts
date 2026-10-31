import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import mongoose from "mongoose";

jest.mock("../../../src/util/minio", () => ({
  uploadToMinio: jest.fn().mockResolvedValue("ok"),
  uploadFileToMinio: jest.fn().mockResolvedValue("ok"),
  deleteFromMinio: jest.fn().mockResolvedValue(undefined),
  resolveUrl: jest.fn((key: string) => `http://localhost:5000/api/v1/upload/files/${key}`),
}));

import { UploadService } from "../../../src/module/upload/upload.service";
import { Job } from "../../../src/module/job/job.model";
import { uploadToMinio, uploadFileToMinio, deleteFromMinio } from "../../../src/util/minio";

const USER = new mongoose.Types.ObjectId().toString();
const OTHER = new mongoose.Types.ObjectId().toString();

const tmp = (name: string, data: Buffer) => {
  const p = path.join(os.tmpdir(), `${Date.now()}-${Math.random().toString(36).slice(2)}-${name}`);
  fs.writeFileSync(p, data);
  return { path: p, originalname: name, size: data.length };
};

const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#336699" } }).png().toBuffer();

beforeEach(() => jest.clearAllMocks());

describe("uploadImage", () => {
  it("re-encodes a real image to WebP under the user's folder and removes the temp file", async () => {
    const file = tmp("photo.png", await png());
    const res = await UploadService.uploadImage(file, USER);
    expect(res.key).toMatch(new RegExp(`^images/${USER}/[0-9a-f]{8}-photo\\.webp$`));
    expect(uploadToMinio).toHaveBeenCalledWith(expect.any(Buffer), res.key, "image/webp");
    expect(fs.existsSync(file.path)).toBe(false);
  });

  it("looks at the bytes, not the name: a script renamed .jpg is refused (UP-05)", async () => {
    const file = tmp("evil.jpg", Buffer.from("<html><script>alert(1)</script></html>"));
    await expect(UploadService.uploadImage(file, USER)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
    expect(uploadToMinio).not.toHaveBeenCalled();
    expect(fs.existsSync(file.path)).toBe(false);
  });

  it("SVG is refused for normal users and sanitised for staff", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>',
    );
    await expect(UploadService.uploadImage(tmp("icon.svg", svg), USER)).rejects.toMatchObject({ code: "SVG_NOT_ALLOWED" });

    const res = await UploadService.uploadImage(tmp("icon.svg", svg), USER, { isStaff: true });
    expect(res.key).toMatch(new RegExp(`^icons/${USER}/`));
    const stored = (uploadToMinio as jest.Mock).mock.calls[0][0].toString();
    expect(stored).not.toContain("script");
    expect(stored).not.toContain("onload");
    expect(stored).toContain("circle");
  });
});

describe("uploadDocument (KYC)", () => {
  it("stores photos in the private documents/ area", async () => {
    const res = await UploadService.uploadDocument(tmp("id.png", await png()), USER);
    expect(res.key).toMatch(new RegExp(`^documents/${USER}/`));
  });
  it("PDF is not accepted (nothing can read it)", async () => {
    const pdf = Buffer.from("%PDF-1.4 fake pdf content here");
    await expect(UploadService.uploadDocument(tmp("id.pdf", pdf), USER)).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });
});

describe("uploadVideo (UP-02)", () => {
  const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypmp42"), Buffer.alloc(32)]);

  it("is streamed from disk, never buffered in memory", async () => {
    const file = tmp("clip.mp4", mp4());
    const res = await UploadService.uploadVideo(file, USER);
    expect(res.key).toMatch(new RegExp(`^videos/${USER}/[0-9a-f]{8}-clip\\.mp4$`));
    expect(uploadFileToMinio).toHaveBeenCalledWith(file.path, res.key, "video/mp4");
    expect(fs.existsSync(file.path)).toBe(false);
  });

  it("a non-video is refused", async () => {
    await expect(UploadService.uploadVideo(tmp("clip.mp4", Buffer.from("not a video at all......")), USER)).rejects.toMatchObject({
      code: "INVALID_VIDEO",
    });
  });
});

describe("deleteFile (UP-01)", () => {
  const key = `images/${USER}/a.webp`;

  it("another user cannot delete my file", async () => {
    await expect(UploadService.deleteFile(key, { userId: OTHER })).rejects.toMatchObject({ statusCode: 403 });
    expect(deleteFromMinio).not.toHaveBeenCalled();
  });

  it("the owner can delete an unused file", async () => {
    await UploadService.deleteFile(key, { userId: USER });
    expect(deleteFromMinio).toHaveBeenCalledWith(key);
  });

  it("a file that a job still shows cannot be deleted", async () => {
    await Job.create({ title: "x", budget: 100, postedBy: USER, category: new mongoose.Types.ObjectId(), images: [key] });
    await expect(UploadService.deleteFile(key, { userId: USER })).rejects.toMatchObject({ code: "FILE_IN_USE" });
  });

  it("staff can remove any unused file; junk keys are rejected", async () => {
    await UploadService.deleteFile(key, { userId: OTHER, isStaff: true });
    expect(deleteFromMinio).toHaveBeenCalled();
    await expect(UploadService.deleteFile("../../etc/passwd", { userId: USER })).rejects.toMatchObject({ statusCode: 400 });
  });
});
