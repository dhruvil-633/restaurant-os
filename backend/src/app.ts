import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './config/logger';
import { globalErrorHandler, notFoundHandler } from './middlewares/error';
import { apiRateLimiter } from './middlewares/rateLimit';
import { sanitizeRequest } from './middlewares/security';
import { apiRouter } from './routes';

export function createApp(): Application {
  const app = express();

  // Render sits behind one proxy hop; this makes req.ip (and therefore rate
  // limiting) read the real client address instead of the proxy's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON and uploaded images to a separate origin, so the
      // default same-origin resource policy would block the frontend.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.isProduction ? undefined : false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser callers (curl, health checks) send no Origin.
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        // Vercel preview deployments get a fresh subdomain per commit.
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
          callback(null, true);
          return;
        }
        logger.warn(`Blocked CORS request from ${origin}`);
        callback(new Error('This origin is not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(sanitizeRequest);

  if (!env.isProduction) {
    app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  // Local-disk uploads fallback. Harmless when a cloud provider is configured.
  app.use(
    '/uploads',
    express.static(path.resolve(process.cwd(), 'uploads'), {
      maxAge: env.isProduction ? '30d' : 0,
      fallthrough: true,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      message: 'RestaurantOS API is running',
      data: {
        status: 'ok',
        environment: env.NODE_ENV,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.use('/api', apiRateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}
