/**
 * Postgres NUMERIC arrives as a string to preserve exact decimal precision.
 * Money and quantities are converted at the API boundary so the frontend and
 * its charts always receive real numbers.
 */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Rounds to two decimals without float drift (e.g. 12.345 → 12.35). */
export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
