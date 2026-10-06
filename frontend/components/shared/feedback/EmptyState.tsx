import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** أخف للأقسام داخل الصفحة */
  compact?: boolean;
  /**
   * tone:
   * - default: primary soft icon (empty lists)
   * - muted: neutral (optional / secondary)
   * - warning: soft warning (offline / attention)
   */
  tone?: 'default' | 'muted' | 'warning';
}

/**
 * حالة فارغة موحّدة — هادئة، مفهومة، مع مساحة تنفّس.
 * tone variants + consistent icon well.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
  tone = 'default',
}: Props) {
  const iconWell =
    tone === 'warning'
      ? 'bg-warning-soft text-warning-foreground'
      : tone === 'muted'
        ? 'bg-muted text-muted-foreground'
        : 'bg-primary/10 text-primary';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center section-enter',
        compact ? 'gap-3 py-8 sm:py-10' : 'gap-4 py-12 sm:py-16',
        className,
      )}
      role="status"
    >
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-2xl shadow-xs',
            '[&_svg]:h-7 [&_svg]:w-7 sm:[&_svg]:h-8 sm:[&_svg]:w-8',
            compact ? 'h-12 w-12' : 'h-14 w-14 sm:h-16 sm:w-16',
            iconWell,
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
