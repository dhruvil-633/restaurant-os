import { env } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const COLOR: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

const RESET = '\x1b[0m';
const minimumWeight = env.isProduction ? LEVEL_WEIGHT.info : LEVEL_WEIGHT.debug;

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (LEVEL_WEIGHT[level] < minimumWeight) return;

  const timestamp = new Date().toISOString();

  if (env.isProduction) {
    // Structured single-line JSON — friendly to Render's log ingestion.
    const payload = { timestamp, level, message, ...(meta ? { meta } : {}) };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  const label = `${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
  const time = `\x1b[90m${timestamp.slice(11, 23)}${RESET}`;
  process.stdout.write(`${time} ${label} ${message}\n`);

  if (meta !== undefined) {
    process.stdout.write(`${'\x1b[90m'}${formatMeta(meta)}${RESET}\n`);
  }
}

function formatMeta(meta: unknown): string {
  if (meta instanceof Error) return meta.stack ?? meta.message;
  if (typeof meta === 'string') return meta;
  try {
    return JSON.stringify(meta, null, 2);
  } catch {
    return String(meta);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
