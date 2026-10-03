'use client';

/**
 * ⚡ سرعة الرد — يعرض responseTimeMinutes من SellerProfile.
 * لا يحسب شيئًا على العميل؛ القيمة تأتي من الـ API.
 */

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatResponseTime(minutes: number): string {
  if (minutes < 1) return 'خلال دقيقة';
  if (minutes < 60) return `خلال ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `خلال ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `خلال ${days} يوم`;
}

interface Props {
  /** دقائق — من SellerProfile.responseTimeMinutes */
  responseTimeMinutes?: number | null;
  responseRate?: number | null;
  className?: string;
  /** compact = سطر واحد للأيقونة + النص */
  size?: 'sm' | 'md';
}

export function ResponseTimeBadge({
  responseTimeMinutes,
  responseRate,
  className,
  size = 'sm',
}: Props) {
  if (responseTimeMinutes == null || responseTimeMinutes <= 0) return null;

  const label = formatResponseTime(responseTimeMinutes);
  const rateHint =
    responseRate != null && responseRate >= 70
      ? ' · يرد غالبًا'
      : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-muted-foreground',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className
      )}
      title={
        responseRate != null
          ? `متوسط زمن الرد ≈ ${responseTimeMinutes} د · معدل الرد ${Math.round(Number(responseRate))}%`
          : `متوسط زمن الرد ≈ ${responseTimeMinutes} دقيقة`
      }
    >
      <Zap className={cn('shrink-0 text-warning', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      <span>
        ⚡ يرد عادة {label}
        {rateHint}
      </span>
    </span>
  );
}
