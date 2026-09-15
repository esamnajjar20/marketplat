import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** حجم أخف للأقسام داخل الصفحة */
  compact?: boolean;
}

/**
 * حالة فارغة / خطأ — هادئة، مفهومة، مع مساحة تنفّس.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center section-enter',
        compact ? 'gap-3 py-10' : 'gap-4 py-14 sm:py-16',
        className,
      )}
      role="status"
    >
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs [&_svg]:h-7 [&_svg]:w-7 sm:[&_svg]:h-8 sm:[&_svg]:w-8',
            compact ? 'h-12 w-12' : 'h-14 w-14 sm:h-16 sm:w-16',
          )}
        >
          {icon}
        </div>
      )}
      <div className={cn('space-y-1.5', compact ? 'max-w-xs' : 'max-w-sm')}>
        <p className="text-base font-semibold tracking-tight text-foreground sm:text-[1.05rem]">
          {title}
        </p>
        {description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
