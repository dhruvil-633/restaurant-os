export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * Errors thrown with ApiError are considered "expected" — the global handler
 * reports their message verbatim. Anything else is treated as a bug and is
 * reduced to a generic 500 in production.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly issues?: FieldIssue[];
  public readonly isOperational = true;

  constructor(statusCode: number, message: string, code?: string, issues?: FieldIssue[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? defaultCodeFor(statusCode);
    this.issues = issues;
    Object.setPrototypeOf(this, ApiError.prototype);
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', issues?: FieldIssue[]): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', issues);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have permission to perform this action'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(resource = 'Resource'): ApiError {
    return new ApiError(404, `${resource} not found`, 'NOT_FOUND');
  }

  static conflict(message = 'Resource already exists'): ApiError {
    return new ApiError(409, message, 'CONFLICT');
  }

  static unprocessable(message = 'Validation failed', issues?: FieldIssue[]): ApiError {
    return new ApiError(422, message, 'VALIDATION_ERROR', issues);
  }

  static tooManyRequests(message = 'Too many requests, please slow down'): ApiError {
    return new ApiError(429, message, 'RATE_LIMITED');
  }

  static internal(message = 'Something went wrong on our end'): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }
}

function defaultCodeFor(statusCode: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
  };
  return map[statusCode] ?? 'ERROR';
}
