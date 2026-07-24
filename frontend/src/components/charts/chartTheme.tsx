import type { ReactNode } from 'react';
import { cn, formatCurrency } from '@/lib/utils';

/**
 * A single categorical ramp used by every chart, so a series colour means the
 * same thing across the app. Values are fixed hexes rather than CSS variables
 * because Recharts writes them into SVG attributes, which cannot resolve
 * `var()` in every browser.
 */
export const CHART_COLORS = {
  brand: '#10b981',
  accent: '#f97316',
  info: '#3b82f6',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  teal: '#14b8a6',
  slate: '#94a3b8',
} as const;

export const CHART_SERIES = [
  CHART_COLORS.brand,
  CHART_COLORS.accent,
  CHART_COLORS.info,
  CHART_COLORS.violet,
  CHART_COLORS.amber,
  CHART_COLORS.teal,
  CHART_COLORS.rose,
  CHART_COLORS.slate,
];

export const AXIS_PROPS = {
  stroke: 'var(--ink-subtle)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  stroke: 'var(--line)',
  strokeDasharray: '3 3',
  vertical: false,
} as const;

interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  /** Keys whose values should render as money. */
  currencyKeys?: string[];
  labelFormatter?: (label: string | number) => string;
}

/** Shared tooltip so every chart reads identically in light and dark themes. */
export function ChartTooltip({
  active,
  payload,
  label,
  currencyKeys = [],
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lg">
      {label !== undefined && (
        <p className="mb-1.5 text-xs font-semibold text-ink">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? '');
          const isCurrency = currencyKeys.includes(key);
          const numeric = typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0);

          return (
            <div key={`${key}-${index}`} className="flex items-center gap-2 text-xs">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-ink-muted">{entry.name}</span>
              <span className="ml-auto font-semibold text-ink tabular">
                {isCurrency ? formatCurrency(numeric) : numeric.toLocaleString('en-IN')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegend({
  items,
  className,
}: {
  items: { label: string; color: string; value?: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-ink-muted">{item.label}</span>
          {item.value !== undefined && (
            <span className="font-semibold text-ink tabular">{item.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Compact axis tick for money — avoids "₹1,25,000" crowding the gutter. */
export function currencyTick(value: number): string {
  return formatCurrency(value, { compact: true });
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}
