import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";

const unlinkFile = async (file: string): Promise<void> => {
  const filePath = path.join("uploads", file);
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      if (fs.existsSync(filePath)) {
        await fsPromises.unlink(filePath);
        return;
      }
      return;
    } catch (error: unknown) {
      lastError = error as Error;
      if ((error as NodeJS.ErrnoException).code === "EBUSY" && i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
        continue;
      }
      break;
    }
  }

  if (lastError) {
    console.error(`Failed to delete file ${filePath}:`, lastError.message);
  }
};

export default unlinkFile;
