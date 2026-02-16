/**
 * Binary file detection utilities.
 *
 * Extension-based detection: a file is considered binary if its extension
 * is in the known BINARY_EXTENSIONS set. The server uses this to set
 * `is_binary` and `extension` metadata on file records.
 */

const BINARY_EXTENSIONS = new Set([
  // Images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "ico",
  "svg",
  "tiff",
  "tif",
  // Documents
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  // Archives
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "bz2",
  "xz",
  // Audio
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "wma",
  "m4a",
  // Video
  "mp4",
  "avi",
  "mkv",
  "mov",
  "wmv",
  "flv",
  "webm",
  // Executables
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  // Fonts
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
  // Databases
  "db",
  "sqlite",
  "sqlite3",
]);

/**
 * Extract the file extension from a path.
 *
 * Returns the extension in lowercase without the dot, or null if no extension.
 *
 * Edge cases:
 * - `notes/daily.md` → `"md"`
 * - `file.test.md` → `"md"` (last extension)
 * - `.gitignore` → `null` (dotfile, not an extension)
 * - `README` → `null` (no extension)
 * - `path/to/.env` → `null` (dotfile)
 * - `.env.local` → `"local"` (dotfile with extension)
 * - `PHOTO.JPG` → `"jpg"` (case normalized)
 */
export function extractExtension(path: string): string | null {
  // Get the filename (last segment after /)
  const filename = path.split("/").pop() ?? path;

  // Find the last dot
  const lastDot = filename.lastIndexOf(".");

  // No dot, or dot is at position 0 with no further dots (dotfile like .gitignore)
  if (lastDot <= 0) {
    return null;
  }

  const ext = filename.slice(lastDot + 1).toLowerCase();

  // Empty extension (file ends with dot)
  if (ext.length === 0) {
    return null;
  }

  return ext;
}

/**
 * Determine if a file extension indicates a binary file.
 */
export function isBinaryExtension(extension: string | null): boolean {
  if (extension === null) {
    return false;
  }
  return BINARY_EXTENSIONS.has(extension);
}

/**
 * Extract extension and binary status from a file path.
 * Convenience function for use in file create/update/rename operations.
 */
export function getFileMetadata(path: string): {
  extension: string | null;
  isBinary: boolean;
} {
  const extension = extractExtension(path);
  return {
    extension,
    isBinary: isBinaryExtension(extension),
  };
}
