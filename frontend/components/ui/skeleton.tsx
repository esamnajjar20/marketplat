import { cn } from '@/lib/utils';

/**
 * هيكل تحميل موحّد — يستخدم bg-muted (ثيم فاتح/داكن) لا hex ثابت.
 * shimmer يحترم prefers-reduced-motion عبر globals.css.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-2xl bg-muted', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };
