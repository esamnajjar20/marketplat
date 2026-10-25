import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

const buttonVariants = cva(
  'inline-flex min-w-fit items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] text-sm font-medium leading-5 transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out active:scale-[0.99] active:brightness-95 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-xs hover:bg-muted hover:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        /** Soft brand tint — secondary actions that stay on-brand without solid fill */
        soft:
          'bg-primary-soft text-primary shadow-xs hover:bg-primary-soft/80',
        /** Terracotta CTA — featured / high-emphasis marketing actions */
        brand:
          'bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 hover:shadow-md',
      },
      size: {
        // FIX BTN-TOUCH-01: primary CTAs meet 44px (WCAG AAA / Apple HIG).
        // sm/icon stay at 40px (WCAG AA needs 24px only) — 70 admin/layout
        // usages plus manual h-8/h-9 overrides rely on the denser size.
        default: 'min-h-[var(--control-height)] px-4 py-2',
        sm: 'min-h-[var(--control-height-sm)] max-sm:min-h-[var(--control-height)] rounded-[var(--radius-control)] px-3 text-sm',
        lg: 'min-h-[var(--control-height-lg)] rounded-[var(--radius-control)] px-6 sm:px-8 text-base',
        icon: 'h-[var(--touch-target)] min-h-[var(--touch-target)] w-[var(--touch-target)] min-w-[var(--touch-target)] shrink-0 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * حالة انتظار موحّدة: يعطّل الزر + aria-busy + Spinner.
   * بدون loadingText يبقى عرض الزر ثابتاً (المحتوى شفاف والمؤشر فوقه)؛
   * مع loadingText يُستبدل المحتوى بالنص + مؤشر. تُتجاهل مع asChild.
   */
  loading?: boolean;
  loadingText?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, loadingText, disabled, children, ...props },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    const hasLoadingText = loading && loadingText != null && size !== 'icon';

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }), loading && !hasLoadingText && 'relative')}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        {!loading && children}
        {hasLoadingText && (
          <>
            <Spinner size="sm" />
            {loadingText}
          </>
        )}
        {loading && !hasLoadingText && (
          <>
            {/* opacity-0 (لا invisible) ليبقى الاسم المسموع للزر لقارئ الشاشة وعرضه ثابتاً */}
            <span className="inline-flex items-center justify-center gap-2 opacity-0">{children}</span>
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner size="sm" />
            </span>
          </>
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
