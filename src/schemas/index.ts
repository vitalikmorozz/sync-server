import { z } from "zod";

// ============================================================================
// Store Schemas
// ============================================================================

export const createStoreSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be 255 characters or less"),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;

// ============================================================================
// API Key Schemas
// ============================================================================

export const permissionSchema = z.enum(["read", "write"]);

export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be 255 characters or less"),
  permissions: z
    .array(permissionSchema)
    .min(1, "At least one permission is required")
    .refine(
      (perms) => new Set(perms).size === perms.length,
      "Duplicate permissions not allowed",
    ),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// ============================================================================
// File Schemas
// ============================================================================

// Path validation: no special characters that could cause issues
const pathRegex = /^[^<>:"|?*\x00-\x1f]+$/;

export const filePathSchema = z
  .string()
  .min(1, "Path is required")
  .max(1000, "Path must be 1000 characters or less")
  .regex(pathRegex, "Path contains invalid characters");

export const createFileSchema = z.object({
  path: filePathSchema,
  content: z.string().max(10 * 1024 * 1024, "Content must be 10MB or less"),
});

export type CreateFileInput = z.infer<typeof createFileSchema>;

export const updateFileSchema = z.object({
  path: filePathSchema,
  content: z.string().max(10 * 1024 * 1024, "Content must be 10MB or less"),
});

export type UpdateFileInput = z.infer<typeof updateFileSchema>;

export const renameFileSchema = z.object({
  path: filePathSchema,
  newPath: filePathSchema,
});

export type RenameFileInput = z.infer<typeof renameFileSchema>;

// ============================================================================
// Query Schemas
// ============================================================================

export const listFilesQuerySchema = z.object({
  path: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
  include_deleted: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
});

export type ListFilesQuery = z.infer<typeof listFilesQuerySchema>;

/**
 * Query schema for endpoints that require a file path
 * Used by GET, DELETE /files
 */
export const filePathQuerySchema = z.object({
  path: filePathSchema,
});

export type FilePathQuery = z.infer<typeof filePathQuerySchema>;

// ============================================================================
// Validation Helper
// ============================================================================

import { ValidationError } from "../errors";

/**
 * Validate input against a Zod schema
 * Throws ValidationError if validation fails
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    throw new ValidationError("Validation failed", { errors });
  }
  return result.data;
}
