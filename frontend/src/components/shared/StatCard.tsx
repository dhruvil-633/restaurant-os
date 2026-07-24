import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Percentage change against the comparison period. */
  trend?: number;
  trendLabel?: string;
  hint?: string;
  tone?: 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  loading?: boolean;
  onClick?: () => void;
  index?: number;
}

const TONE_STYLES: Record<string, { bg: string; text: string }> = {
  brand: { bg: 'bg-brand-soft', text: 'text-brand' },
  accent: { bg: 'bg-accent-soft', text: 'text-accent' },
  success: { bg: 'bg-success-soft', text: 'text-success' },
  warning: { bg: 'bg-warning-soft', text: 'text-warning' },
  danger: { bg: 'bg-danger-soft', text: 'text-danger' },
  info: { bg: 'bg-info-soft', text: 'text-info' },
};

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel = 'vs yesterday',
  hint,
  tone = 'brand',
  loading = false,
  onClick,
  index = 0,
}: StatCardProps) {
  const styles = TONE_STYLES[tone] ?? TONE_STYLES.brand;

  if (loading) {
    return (
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="size-10 rounded-xl" />
        </div>
      </Card>
    );
  }

  const TrendIcon = trend === undefined ? Minus : trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card
        onClick={onClick}
        className={cn(
          'group relative overflow-hidden p-5',
          onClick && 'cursor-pointer hover:shadow-md hover:border-line-strong transition-all',
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink-muted">{label}</p>
            <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-ink tabular">
              {value}
            </p>

            {trend !== undefined ? (
              <div className="mt-2.5 flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                    trend > 0
                      ? 'bg-success-soft text-success-soft-ink'
                      : trend < 0
                        ? 'bg-danger-soft text-danger-soft-ink'
                        : 'bg-surface-sunken text-ink-muted',
                  )}
                >
                  <TrendIcon className="size-3" />
                  {Math.abs(trend).toFixed(1)}%
                </span>
                <span className="truncate text-[11px] text-ink-subtle">{trendLabel}</span>
              </div>
            ) : hint ? (
              <p className="mt-2.5 truncate text-[11px] text-ink-subtle">{hint}</p>
            ) : null}
          </div>

          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
              styles?.bg,
              styles?.text,
            )}
          >
            <Icon className="size-[18px]" />
          </span>
        </div>
      </Card>
    </motion.div>
  );
}
