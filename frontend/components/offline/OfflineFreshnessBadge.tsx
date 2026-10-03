'use client';

/**
 * OFFLINE-FRESHNESS-01 — شارة موحّدة «آخر تحديث / قد تكون قديمة».
 *
 * استخدمها فوق أي قائمة أو بطاقة تُعرض من offlineJson / offlineList / كاش SW.
 */

import { offlineFreshnessLabel, type OfflineFreshnessKind } from '@/lib/offlineFreshness';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

export interface OfflineFreshnessBadgeProps {
  savedAt?: string | null;
  kind?: OfflineFreshnessKind;
  /** فرض حالة أوفلاين (اختياري — الافتراضي من navigator). */
  forceOffline?: boolean;
  className?: string;
  /** إخفاء الشارة عندما تكون البيانات حديثة وأونلاين. */
  hideWhenFresh?: boolean;
}

export function OfflineFreshnessBadge({
  savedAt,
  kind = 'list',
  forceOffline,
  className,
  hideWhenFresh = true,
}: OfflineFreshnessBadgeProps) {
  const online = useOnlineStatus();
  const isOffline = forceOffline ?? !online;
  const label = offlineFreshnessLabel(savedAt, { kind, isOffline });

  if (!label) return null;
  if (hideWhenFresh && !isOffline && !label.includes('قديمة')) return null;

  const isWarning = isOffline || label.includes('قديمة');

  return (
    <p
      role="status"
      className={cn(
        'text-xs',
        isWarning
          ? 'text-warning-strong dark:text-warning'
          : 'text-muted-foreground',
        className,
      )}
    >
      {label}
    </p>
  );
}
