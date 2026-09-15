import { cn } from '@/lib/utils';

/**
 * هيكل تحميل — shimmer ناعم بدل نبض باهت.
 * يحترم prefers-reduced-motion عبر globals.css.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
