import sharp from "sharp";
import { optimize } from "svgo";
import path from "path";

type ImageProfile = "profile" | "document";

interface ProcessImageOptions {
  buffer: Buffer;
  originalName: string;
  profile: ImageProfile;
}

interface ProcessedImage {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

const PROFILE_CONFIG: sharp.WebpOptions = {
  quality: 75,
  effort: 2,
};

const DOCUMENT_CONFIG: sharp.WebpOptions = {
  quality: 100,
  effort: 2,
};

const generateFilename = (originalName: string, ext: string): string => {
  const baseName = originalName.replace(/\.[^.]+$/, "");
  const safeName = baseName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
  const uuid = crypto.randomUUID().slice(0, 8);
  return `${uuid}-${safeName}${ext}`;
};

const isSvg = (filename: string): boolean => {
  return path.extname(filename).toLowerCase() === ".svg";
};

const sanitizeSvg = (buffer: Buffer): Buffer => {
  const result = optimize(buffer.toString("utf-8"), {
    plugins: [
      "preset-default",
      "removeDimensions",
      {
        name: "removeAttrs",
        params: { attrs: "(data-*|onclick|onload|onerror)" },
      },
      {
        name: "addAttributesToSVGElement",
        params: {
          attributes: [{ xmlns: "http://www.w3.org/2000/svg" }],
        },
      },
    ],
  });
  return Buffer.from(result.data, "utf-8");
};

export const processImage = async ({
  buffer,
  originalName,
  profile,
}: ProcessImageOptions): Promise<ProcessedImage> => {
  // SVGs: sanitize only, skip Sharp processing
  if (isSvg(originalName)) {
    const sanitized = sanitizeSvg(buffer);
    return {
      buffer: sanitized,
      filename: generateFilename(originalName, ".svg"),
      contentType: "image/svg+xml",
    };
  }

  // Raster images: convert to WebP
  const config = profile === "profile" ? PROFILE_CONFIG : DOCUMENT_CONFIG;

  const processedBuffer = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
    .webp(config)
    .toBuffer();

  return {
    buffer: processedBuffer,
    filename: generateFilename(originalName, ".webp"),
    contentType: "image/webp",
  };
};
