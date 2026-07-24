import type { Response } from 'express';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Escapes a value for CSV. Any field opening with `=`, `+`, `-` or `@` is
 * prefixed with a quote so spreadsheet software treats it as text rather than
 * executing it as a formula.
 */
function escapeCell(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  const value = String(input);
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function buildCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCell(column.header)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(column.value(row))).join(','),
  );
  // The BOM makes Excel open UTF-8 correctly on Windows.
  return `﻿${[header, ...body].join('\r\n')}`;
}

export function sendCsv(res: Response, filename: string, csv: string): void {
  const safeName = filename.replace(/[^a-z0-9._-]/gi, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.status(200).send(csv);
}
