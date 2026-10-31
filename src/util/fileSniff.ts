import fs from "fs";

export type SniffedKind =
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "svg"
  | "mp4"
  | "mov"
  | "3gp"
  | "webm"
  | "avi"
  | "pdf"
  | null;

/**
 * Identifies a file by its first bytes (not by the name or the Content-Type
 * header the client claims), so a script renamed to .jpg is recognised as such.
 */
export const sniffFile = async (filePath: string): Promise<SniffedKind> => {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buf = Buffer.alloc(512);
    const { bytesRead } = await handle.read(buf, 0, 512, 0);
    const b = buf.subarray(0, bytesRead);
    if (b.length < 12) return null;

    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
    if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return "png";
    if (b.toString("ascii", 0, 4) === "GIF8") return "gif";
    if (b.toString("ascii", 0, 4) === "RIFF") {
      const form = b.toString("ascii", 8, 12);
      if (form === "WEBP") return "webp";
      if (form === "AVI ") return "avi";
    }
    if (b.toString("ascii", 4, 8) === "ftyp") {
      const brand = b.toString("ascii", 8, 12);
      if (brand.startsWith("qt")) return "mov";
      if (brand.startsWith("3g")) return "3gp";
      return "mp4";
    }
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
    if (b.toString("ascii", 0, 5) === "%PDF-") return "pdf";

    const head = b.toString("utf8", 0, Math.min(b.length, 256)).trimStart().toLowerCase();
    if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
      return "svg";
    }
    return null;
  } finally {
    await handle.close();
  }
};

export const IMAGE_KINDS: SniffedKind[] = ["jpeg", "png", "webp"];
export const VIDEO_KINDS: SniffedKind[] = ["mp4", "mov", "3gp", "webm", "avi"];

export const contentTypeFor = (kind: SniffedKind): string => {
  switch (kind) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "3gp":
      return "video/3gpp";
    case "webm":
      return "video/webm";
    case "avi":
      return "video/x-msvideo";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
};

export const extensionFor = (kind: SniffedKind): string => {
  switch (kind) {
    case "jpeg":
      return ".jpg";
    case "mov":
      return ".mov";
    case "3gp":
      return ".3gp";
    case "webm":
      return ".webm";
    case "avi":
      return ".avi";
    case "svg":
      return ".svg";
    default:
      return ".mp4";
  }
};
