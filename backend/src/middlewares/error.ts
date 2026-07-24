import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError, type FieldIssue } from '../utils/apiError';
import { env } from '../config/env';
import { logger } from '../config/logger';

interface ErrorBody {
  success: false;
  message: string;
  code: string;
  issues?: FieldIssue[];
  stack?: string;
}

/** Terminal 404 handler — mounted after every route. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} does not exist`, 'ROUTE_NOT_FOUND'));
};

export const globalErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const resolved = normalize(error);

  if (resolved.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${resolved.statusCode}`, error);
  } else {
    logger.warn(`${req.method} ${req.originalUrl} → ${resolved.statusCode} ${resolved.message}`);
  }

  const body: ErrorBody = {
    success: false,
    message: resolved.message,
    code: resolved.code,
  };

  if (resolved.issues?.length) body.issues = resolved.issues;
  // Stack traces leak internals; development only.
  if (!env.isProduction && error instanceof Error && error.stack) body.stack = error.stack;

  res.status(resolved.statusCode).json(body);
};

function normalize(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.unprocessable('Validation failed', zodIssues(error));
  }

  if (isPostgresError(error)) {
    return translatePostgresError(error);
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return ApiError.badRequest('Request body is not valid JSON');
  }

  if (isMulterLimitError(error)) {
    return ApiError.badRequest('File is too large. The maximum upload size is 5 MB.');
  }

  // Anything unrecognised is a bug — never surface its message in production.
  const message =
    !env.isProduction && error instanceof Error
      ? error.message
      : 'Something went wrong on our end';
  return ApiError.internal(message);
}

export function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message,
  }));
}

interface PostgresError {
  code: string;
  detail?: string;
  constraint_name?: string;
  table_name?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    /^[0-9A-Z]{5}$/.test((error as { code: string }).code)
  );
}

/** Map the Postgres error classes a client can actually cause into 4xx replies. */
function translatePostgresError(error: PostgresError): ApiError {
  switch (error.code) {
    case '23505': // unique_violation
      return ApiError.conflict(friendlyUniqueMessage(error));
    case '23503': // foreign_key_violation
      return ApiError.badRequest(
        'This record references something that does not exist, or is still referenced elsewhere.',
      );
    case '23502': // not_null_violation
      return ApiError.badRequest('A required field was missing.');
    case '22P02': // invalid_text_representation
      return ApiError.badRequest('One of the supplied values has the wrong format.');
    case '23514': // check_violation
      return ApiError.badRequest('A value fell outside its allowed range.');
    default:
      return ApiError.internal(
        env.isProduction ? 'Database error' : `Database error (${error.code}): ${error.detail ?? ''}`,
      );
  }
}

function friendlyUniqueMessage(error: PostgresError): string {
  const constraint = error.constraint_name ?? '';
  if (constraint.includes('email')) return 'That email address is already registered.';
  if (constraint.includes('phone')) return 'That phone number is already on file.';
  if (constraint.includes('label')) return 'A table with that label already exists.';
  if (constraint.includes('slug')) return 'A category with that name already exists.';
  if (constraint.includes('employee_code')) return 'That employee code is already taken.';
  return 'That record already exists.';
}

function isMulterLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'LIMIT_FILE_SIZE'
  );
}
