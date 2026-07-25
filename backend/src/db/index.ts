import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { env } from '../config/env';
import { logger } from '../config/logger';
import * as schema from './schema';

const isLocal =
  env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1');

/**
 * Supabase's transaction pooler (port 6543) multiplexes connections and cannot
 * hold prepared statements, so they are disabled when that port is in use.
 */
const usesTransactionPooler = env.DATABASE_URL.includes(':6543');

export const queryClient = postgres(env.DATABASE_URL, {
  ssl: isLocal ? false : 'require',
  prepare: !usesTransactionPooler,
  // Render's free tier is single-instance; a small pool avoids exhausting
  // Supabase's connection budget while staying responsive.
  max: env.isProduction ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 30,
  onnotice: () => undefined,
});

export const db = drizzle(queryClient, { schema, logger: false });

export type Database = typeof db;

/**
 * Drizzle wraps driver errors, which buries the line that actually explains the
 * failure ("password authentication failed", "database does not exist"). This
 * unwraps the cause chain so the boot log names the real problem.
 */
function rootCauseOf(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    const cause = (current as { cause?: unknown } | null)?.cause;
    if (!cause) break;
    current = cause;
  }
  return current instanceof Error ? current.message : String(current);
}

export async function verifyDatabaseConnection(): Promise<void> {
  try {
    await db.execute(sql`select 1`);
    const target = usesTransactionPooler ? 'transaction pooler' : 'session pooler';
    logger.info(`Database connected (${isLocal ? 'local' : target})`);
  } catch (error) {
    const reason = rootCauseOf(error);
    logger.error(`Database connection failed — ${reason}`);

    throw new Error(
      `Could not reach the database: ${reason}\n` +
        '  Check DATABASE_URL in backend/.env. For Supabase, copy the URI from\n' +
        '  Project Settings → Database and URL-encode any special characters in the password.',
    );
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  await queryClient.end({ timeout: 5 });
  logger.info('Database connection closed');
}

export { schema };
