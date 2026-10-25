'use client';

import type { ReactNode } from 'react';
import { RefreshCw, WifiOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type QueryRetryTone = 'error' | 'offline' | 'warning';

export interface QueryRetryCardProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  /** نص الزر — الافتراضي «إعادة المحاولة» */
  retryLabel?: string;
  tone?: QueryRetryTone;
  /** محتوى إضافي تحت الزر (روابط أوفلاين، اقتراحات…) */
  footer?: ReactNode;
  className?: string;
  /** full = بطاقة عريضة، compact = داخل قسم صغير */
  size?: 'full' | 'compact';
  icon?: ReactNode;
}

const TONE_ICON: Record<QueryRetryTone, ReactNode> = {
  offline: <WifiOff className="h-6 w-6" aria-hidden />,
  error: <AlertTriangle className="h-6 w-6" aria-hidden />,
  warning: <AlertTriangle className="h-6 w-6" aria-hidden />,
};

const TONE_WELL: Record<QueryRetryTone, string> = {
  offline: 'bg-red-50 text-[#9B2C2C] dark:bg-red-950/40 dark:text-red-400',
  error: 'bg-red-50 text-[#9B2C2C] dark:bg-red-950/40 dark:text-red-400',
  warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
};

const TONE_TITLE: Record<QueryRetryTone, string> = {
  offline: 'text-[#9B2C2C] dark:text-red-400',
  error: 'text-[#9B2C2C] dark:text-red-400',
  warning: 'text-amber-900 dark:text-amber-300',
};

/**
 * بطاقة خطأ/أوفلاين موحّدة مع زر «إعادة المحاولة» بعرض كامل (تصميم المرجع).
 * استخدمها بدل فقرة حمراء + رابط نصي في كل القوائم والشاشات.
 */
export function QueryRetryCard({
  title,
  description,
  onRetry,
  retryLabel = 'إعادة المحاولة',
  tone = 'error',
  footer,
  className,
  size = 'full',
  icon,
}: QueryRetryCardProps) {
  return (
    <section
      // FIX OFFLINE-A11Y-01: "offline" is a state notice, not an error. role=alert /
      // assertive interrupts screen readers on every offline list (several can
      // mount at once); keep alert semantics for real errors/warnings only.
      role={tone === 'offline' ? 'status' : 'alert'}
      aria-live={tone === 'offline' ? 'polite' : 'assertive'}
      className={cn(
        'mx-auto w-full rounded-2xl border border-[#EAE3D6] bg-white text-center shadow-[0_1px_3px_rgba(42,36,29,0.06)] dark:border-border dark:bg-card',
        size === 'full' ? 'max-w-md p-5' : 'max-w-sm p-4',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto mb-3 flex items-center justify-center rounded-full',
          size === 'full' ? 'h-14 w-14' : 'h-12 w-12',
          TONE_WELL[tone],
        )}
      >
        {icon ?? TONE_ICON[tone]}
      </div>
      <h2 className={cn('text-base font-extrabold leading-snug', TONE_TITLE[tone])}>{title}</h2>
      {description ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#397F56] text-sm font-bold text-white transition-opacity hover:opacity-95',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            size === 'full' ? 'h-11' : 'h-10',
          )}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          {retryLabel}
        </button>
      ) : null}
      {footer ? <div className="mt-4 text-start">{footer}</div> : null}
    </section>
  );
}
