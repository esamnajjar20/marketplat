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
      ? 'bg-[#FBEEE6] text-[#8F3F14]'
      : tone === 'muted'
        ? 'bg-[#F0EADF] text-[#6B6459]'
        : 'bg-[#F0EADF] text-[#6B6459]';

  return (
    <div
      className={cn(
        'section-enter motion-reduce:animate-none flex flex-col items-center justify-center rounded-[14px] border border-[#EAE3D6] bg-card px-4 text-center shadow-[0_1px_3px_rgba(42,36,29,0.04)]',
        compact ? 'gap-2.5 py-8' : 'gap-3 py-10 sm:py-12',
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
        <p className="text-[15px] font-extrabold tracking-tight text-foreground">
          {title}
        </p>
        {description && (
          <p className="text-[13px] leading-5 text-[#6B6459]">{description}</p>
        )}
      </div>
      {action && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>
      )}
    </div>
  );
}
