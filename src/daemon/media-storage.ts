/**
 * Media file storage for Hi-Boss uploads.
 *
 * Saves uploaded files to ~/hiboss/media/<uuid>-<filename>.
 */

import * as fs from "fs";
import * as path from "path";
import { generateUUID } from "../shared/uuid.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Get the media directory path, creating it if it doesn't exist.
 */
export function getMediaDir(dataDir: string): string {
  const mediaDir = path.join(dataDir, "media");
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }
  return mediaDir;
}

/**
 * Sanitize a filename to prevent path traversal and other issues.
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators and null bytes
  const sanitized = filename
    .replace(/[\\/\0]/g, "")
    .replace(/\.\./g, "")
    .trim();
  return sanitized || "upload";
}

/**
 * Save a file buffer to the media directory.
 * Returns the relative path from dataDir (e.g., "media/<uuid>-<filename>").
 */
export function saveMediaFile(
  dataDir: string,
  filename: string,
  data: Buffer
): { relativePath: string; absolutePath: string } {
  if (data.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  const mediaDir = getMediaDir(dataDir);
  const safeFilename = sanitizeFilename(filename);
  const uuid = generateUUID();
  const storedName = `${uuid}-${safeFilename}`;
  const absolutePath = path.join(mediaDir, storedName);

  fs.writeFileSync(absolutePath, data);

  return {
    relativePath: path.join("media", storedName),
    absolutePath,
  };
}

/**
 * Check if a media file exists.
 */
export function mediaFileExists(dataDir: string, relativePath: string): boolean {
  const absolutePath = path.join(dataDir, relativePath);
  return fs.existsSync(absolutePath);
}
