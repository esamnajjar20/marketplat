import { Spinner, type SpinnerSize } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { LOADING_COPY } from '@/lib/loadingCopy';

/**
 * Single accessible presentation layer for loading states across the app.
 * Use `page` for route fallbacks, `section` for data panels, `inline` for small
 * actions, and `overlay` when existing content must remain visible underneath.
 */
export interface LoadingStateProps {
  variant?: 'page' | 'section' | 'inline' | 'overlay';
  size?: SpinnerSize;
  label?: string;
  description?: string;
  hideLabel?: boolean;
  /** Set false only when nested inside an already-announced loading region. */
  announce?: boolean;
  delayed?: boolean;
  className?: string;
  /** Optional wrapper class, mainly useful for overlays. */
  contentClassName?: string;
  /** Styling forwarded to the shared Spinner, for legacy icon-sized call sites. */
  spinnerClassName?: string;
}

export function LoadingState({
  variant = 'section',
  size = variant === 'page' ? 'xl' : variant === 'inline' ? 'sm' : 'md',
  label = LOADING_COPY.default,
  description,
  hideLabel = false,
  announce = true,
  delayed = false,
  className,
  contentClassName,
  spinnerClassName,
}: LoadingStateProps) {
  const content = (
    <div className={cn('flex items-center gap-3', variant === 'page' && 'flex-col text-center', contentClassName)}>
      <Spinner size={size} className={cn("shrink-0 text-primary", spinnerClassName)} />
      {!hideLabel && (
        <div className={cn('min-w-0', variant === 'page' && 'space-y-1')}>
          <p className={cn('text-sm text-foreground', variant !== 'inline' && 'font-medium')}>
            {label}
          </p>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      )}
    </div>
  );

  const base = 'loading-state';
  const variantClass = {
    page: 'flex min-h-[45vh] min-h-[45dvh] flex-col items-center justify-center gap-3 p-6 text-center',
    section: 'flex min-h-24 items-center justify-center p-6',
    inline: 'inline-flex items-center gap-2.5',
    overlay: 'absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-[2px]',
  }[variant];

  return (
    <div
      {...(announce ? { role: 'status' as const, 'aria-live': 'polite' as const, 'aria-busy': true } : {})}
      {...(announce && hideLabel ? { 'aria-label': label } : {})}
      className={cn(base, variantClass, delayed && 'loading-delayed', className)}
    >
      {variant === 'overlay' ? (
        <div className="rounded-2xl border border-border/80 bg-card px-5 py-3 shadow-lg">
          {content}
        </div>
      ) : content}
    </div>
  );
}
