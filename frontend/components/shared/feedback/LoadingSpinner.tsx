/**
 * LoadingSpinner — جذّاب، مفهوم، ومتاح (a11y).
 */
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
  overlay?: boolean;
  label?: string;
  hideLabel?: boolean;
  className?: string;
}

const RING = {
  sm: 'h-5 w-5',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
} as const;

const BORDER = {
  sm: 'border-2',
  md: 'border-[3px]',
  lg: 'border-4',
} as const;

export function LoadingSpinner({
  size = 'md',
  fullPage = false,
  overlay = false,
  label = 'جارٍ التحميل…',
  hideLabel = false,
  className,
}: LoadingSpinnerProps) {
  const spinner = (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={label}
      className={cn('relative shrink-0', RING[size], className)}
    >
      <span
        aria-hidden
        className={cn('absolute inset-0 rounded-full border-muted-foreground/15', BORDER[size])}
      />
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 animate-spin rounded-full border-primary border-t-transparent border-l-transparent',
          BORDER[size],
        )}
        style={{ animationDuration: '0.85s' }}
      />
      <span
        aria-hidden
        className="absolute inset-[32%] rounded-full bg-primary/25 animate-pulse"
      />
      {hideLabel ? <span className="sr-only">{label}</span> : null}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
        {spinner}
        {!hideLabel && (
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
        )}
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
        <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card px-5 py-3 shadow-lg">
          {spinner}
          {!hideLabel && (
            <span className="text-sm font-semibold text-foreground">{label}</span>
          )}
        </div>
      </div>
    );
  }

  if (hideLabel) return spinner;

  return (
    <div className="inline-flex items-center gap-2.5">
      {spinner}
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
