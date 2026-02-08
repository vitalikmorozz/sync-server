/**
 * Base class for API errors
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * 400 Bad Request - Invalid input
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
    this.name = "UnauthorizedError";
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = "Insufficient permissions") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends ApiError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} not found: ${identifier}`
      : `${resource} not found`;
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

/**
 * 409 Conflict - Resource already exists
 */
export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
    this.name = "ConflictError";
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalError extends ApiError {
  constructor(message: string = "Internal server error") {
    super(500, "INTERNAL_ERROR", message);
    this.name = "InternalError";
  }
}
