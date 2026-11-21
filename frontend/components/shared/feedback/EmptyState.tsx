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
  /** Announcement urgency: errors should interrupt politely; ordinary empty states remain status updates. */
  role?: 'status' | 'alert';
}

/**
 * حالة فارغة موحّدة — بطاقة بيضاء بأيقونة دائرية ناعمة (مطابقة للتصميم).
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
  tone = 'default',
  role = 'status',
}: Props) {
  const iconWell =
    tone === 'warning'
      ? 'bg-warning-soft text-warning-strong'
      : tone === 'muted'
        ? 'bg-muted text-muted-foreground'
        : 'bg-primary-soft text-primary';

  return (
    <div
      className={cn(
        // UX-IMPROVEMENT Phase 3: warmer soft shadow + clearer vertical rhythm
        'section-enter motion-reduce:animate-none flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-4 text-center shadow-[0_1px_3px_hsl(var(--shadow-color)/0.06)]',
        compact ? 'gap-2.5 py-8' : 'gap-3.5 py-10 sm:py-12',
        className,
      )}
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
    >
      {icon && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full',
            '[&_svg]:h-5 [&_svg]:w-5',
            compact ? 'h-11 w-11' : 'h-12 w-12',
            iconWell,
          )}
        >
          {icon}
        </div>
      )}
      <div className={cn('space-y-1', compact ? 'max-w-xs' : 'max-w-sm')}>
        <p className="text-card-title font-extrabold tracking-tight text-foreground">
          {title}
        </p>
        {description && (
          <p className="text-sm-tight leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
