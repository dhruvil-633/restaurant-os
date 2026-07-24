import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-ink-muted border-line',
        brand: 'bg-brand-soft text-brand-soft-ink border-transparent',
        accent: 'bg-accent-soft text-accent-soft-ink border-transparent',
        success: 'bg-success-soft text-success-soft-ink border-transparent',
        warning: 'bg-warning-soft text-warning-soft-ink border-transparent',
        danger: 'bg-danger-soft text-danger-soft-ink border-transparent',
        info: 'bg-info-soft text-info-soft-ink border-transparent',
        outline: 'bg-transparent text-ink-muted border-line-strong',
      },
      size: {
        sm: 'px-2 py-0.5 text-[11px]',
        md: 'px-2.5 py-1 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Renders a small leading dot in the current text colour. */
  dot?: boolean;
}

export function Badge({ className, tone, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/* ── Domain status mappings ──────────────────────────────────────────────
   Kept beside the component so a status colour is defined exactly once.   */

type Tone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export const ORDER_STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  cooking: 'info',
  ready: 'brand',
  served: 'accent',
  completed: 'success',
  cancelled: 'danger',
};

export const TABLE_STATUS_TONE: Record<string, Tone> = {
  available: 'success',
  occupied: 'info',
  reserved: 'accent',
  cleaning: 'warning',
};

export const RESERVATION_STATUS_TONE: Record<string, Tone> = {
  pending: 'warning',
  confirmed: 'info',
  seated: 'brand',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
};

export const PAYMENT_STATUS_TONE: Record<string, Tone> = {
  unpaid: 'warning',
  paid: 'success',
  refunded: 'neutral',
};

export { badgeVariants };
