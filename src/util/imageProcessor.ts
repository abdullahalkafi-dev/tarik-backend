import crypto from "crypto";
import sharp from "sharp";
import { optimize } from "svgo";

type ImageProfile = "profile" | "document";

interface ProcessImageOptions {
  /** Path of the uploaded temp file (images are never held fully in memory by the HTTP layer). */
  filePath: string;
  originalName: string;
  profile: ImageProfile;
}

interface ProcessedImage {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

// Profile/job/chat photos: light. Documents (ID cards, selfies): kept sharp enough
// for a human reviewer to read the print.
const PROFILE_CONFIG: sharp.WebpOptions = { quality: 80, effort: 2 };
const DOCUMENT_CONFIG: sharp.WebpOptions = { quality: 85, effort: 2 };
const PROFILE_MAX = 1280;
const DOCUMENT_MAX = 2000;

const generateFilename = (originalName: string, ext: string): string => {
  const baseName = originalName.replace(/\.[^.]+$/, "");
  const safeName = baseName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
  const uuid = crypto.randomUUID().slice(0, 8);
  return `${uuid}-${safeName}${ext}`;
};

/**
 * Admin-only icons: remove everything that can execute (scripts, event
 * handlers, foreign objects, external references) before storing.
 */
export const sanitizeSvg = (raw: string): Buffer => {
  const result = optimize(raw, {
    plugins: [
      "preset-default",
      "removeDimensions",
      "removeScripts",
      "removeUnknownsAndDefaults",
      {
        name: "removeAttrs",
        params: { attrs: "(data-.*|on[a-z]+)" },
      },
      {
        name: "addAttributesToSVGElement",
        params: { attributes: [{ xmlns: "http://www.w3.org/2000/svg" }] },
      },
    ],
  });
  const cleaned = result.data
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    // external references (links, remote images) are not needed for an icon
    .replace(/\s(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
  return Buffer.from(cleaned, "utf-8");
};

export const processSvg = (raw: string, originalName: string): ProcessedImage => ({
  buffer: sanitizeSvg(raw),
  filename: generateFilename(originalName, ".svg"),
  contentType: "image/svg+xml",
});

export const processImage = async ({
  filePath,
  originalName,
  profile,
}: ProcessImageOptions): Promise<ProcessedImage> => {
  const config = profile === "profile" ? PROFILE_CONFIG : DOCUMENT_CONFIG;
  const max = profile === "profile" ? PROFILE_MAX : DOCUMENT_MAX;

  const processedBuffer = await sharp(filePath, { failOn: "none" })
    .rotate()
    .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
    .webp(config)
    .toBuffer();

  return {
    buffer: processedBuffer,
    filename: generateFilename(originalName, ".webp"),
    contentType: "image/webp",
  };
};
