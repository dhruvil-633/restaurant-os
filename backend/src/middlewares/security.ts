import type { RequestHandler } from 'express';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Strips keys that can poison Object.prototype, and drops Mongo-style operator
 * keys (`$gt`, `$where`) that some scanners probe for.
 *
 * Note: this deliberately does *not* strip HTML from values. Injection is
 * already prevented structurally — Drizzle emits parameterised SQL, and React
 * escapes text nodes on render — whereas blanket HTML stripping corrupts
 * legitimate content such as a dish named "Fish & Chips".
 */
function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, depth + 1));
  }

  const source = value as Record<string, unknown>;
  const clean: Record<string, unknown> = {};

  for (const key of Object.keys(source)) {
    if (FORBIDDEN_KEYS.has(key) || key.startsWith('$')) continue;
    clean[key] = sanitizeValue(source[key], depth + 1);
  }

  return clean;
}

export const sanitizeRequest: RequestHandler = (req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
    req.query = sanitizeValue(req.query) as typeof req.query;
  }
  next();
};
