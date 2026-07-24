import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env';

const sharedOptions: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Render terminates TLS at a proxy, so the client IP arrives in X-Forwarded-For.
  // `app.set('trust proxy', 1)` in app.ts makes req.ip resolve correctly.
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a moment and try again.',
      code: 'RATE_LIMITED',
    });
  },
};

/** Broad ceiling applied to the whole API surface. */
export const apiRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUESTS,
});

/** Tight limit on credential endpoints to blunt brute-force attempts. */
export const authRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  skipSuccessfulRequests: true,
});

/** Uploads are expensive; keep them well below the general ceiling. */
export const uploadRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  max: 60,
});
