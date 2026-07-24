import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type AnyZodObject, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/apiError';
import { zodIssues } from './error';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

/**
 * Parses and *replaces* the request parts with their validated output, so
 * controllers receive coerced values (numbers, dates, defaults) rather than
 * the raw strings Express hands over.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request['params'];
      }
      if (schemas.query) {
        // Express 4 exposes `query` as a plain writable property.
        req.query = schemas.query.parse(req.query) as Request['query'];
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(ApiError.unprocessable('Please correct the highlighted fields', zodIssues(error)));
        return;
      }
      next(error);
    }
  };
}
