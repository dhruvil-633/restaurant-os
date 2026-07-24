import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium ' +
    'transition-all duration-150 outline-none select-none ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-white shadow-sm hover:bg-brand-hover hover:shadow-md',
        secondary:
          'bg-surface text-ink border border-line shadow-xs hover:bg-surface-hover hover:border-line-strong',
        ghost: 'text-ink-muted hover:bg-surface-hover hover:text-ink',
        subtle: 'bg-surface-sunken text-ink hover:bg-surface-hover',
        danger: 'bg-danger text-white shadow-sm hover:brightness-110 hover:shadow-md',
        outline:
          'border border-line-strong text-ink bg-transparent hover:bg-surface-hover',
        accent: 'bg-accent text-white shadow-sm hover:brightness-110 hover:shadow-md',
        link: 'text-brand underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-8 px-3 text-[13px] [&_svg]:size-3.5',
        md: 'h-10 px-4 text-sm [&_svg]:size-4',
        lg: 'h-11 px-5 text-[15px] [&_svg]:size-4',
        icon: 'size-10 [&_svg]:size-4',
        'icon-sm': 'size-8 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    // `asChild` renders the caller's element (e.g. a router Link) with these
    // styles, so a spinner cannot be injected into an unknown child.
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { buttonVariants };
