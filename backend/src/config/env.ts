import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Every environment variable the server reads passes through this schema.
 * Required values fail fast at boot with an actionable message; optional
 * integrations resolve to `undefined` so their adapters can degrade.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required — copy it from Supabase → Project Settings → Database')
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),

  JWT_ACCESS_SECRET: z.string().min(24, 'JWT_ACCESS_SECRET must be at least 24 characters'),
  JWT_REFRESH_SECRET: z.string().min(24, 'JWT_REFRESH_SECRET must be at least 24 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),

  SUPABASE_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  SUPABASE_STORAGE_BUCKET: z.string().default('restaurant-os'),

  CLOUDINARY_CLOUD_NAME: z.string().optional().or(z.literal('').transform(() => undefined)),
  CLOUDINARY_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  CLOUDINARY_API_SECRET: z.string().optional().or(z.literal('').transform(() => undefined)),

  SMTP_HOST: z.string().optional().or(z.literal('').transform(() => undefined)),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional().or(z.literal('').transform(() => undefined)),
  SMTP_PASSWORD: z.string().optional().or(z.literal('').transform(() => undefined)),
  MAIL_FROM_NAME: z.string().default('RestaurantOS'),
  MAIL_FROM_ADDRESS: z.string().default('no-reply@restaurantos.app'),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(500),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  // eslint-disable-next-line no-console
  console.error(
    `\n\x1b[31m✖ Invalid environment configuration\x1b[0m\n\n${issues}\n\n` +
      `Copy \x1b[36mbackend/.env.example\x1b[0m to \x1b[36mbackend/.env\x1b[0m and fill in the values.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  hasSupabaseStorage: Boolean(raw.SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY),
  hasCloudinary: Boolean(
    raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET,
  ),
  hasSmtp: Boolean(raw.SMTP_HOST && raw.SMTP_USER && raw.SMTP_PASSWORD),
} as const;

export type Env = typeof env;
