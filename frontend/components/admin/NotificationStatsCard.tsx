// FIX NOTIF-STATS-ERROR-01: error state now uses the shared ApiError
// component instead of a flat "تعذّر تحميل" box.
'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { adminApi } from '@/api/admin.api';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ApiError } from '@/components/shared/ApiError';
import { parseApiError } from '@/lib/errorParser';
import { formatNumber } from '@/lib/formatters';

type NotificationStats = {
  total: number;
  unread: number;
  byType: Array<{ type: string; count: number }>;
};

export function NotificationStatsCard() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'notifications', 'stats', 30],
    queryFn: async (): Promise<NotificationStats> => {
      const r = await adminApi.getNotificationStats({ days: 30 });
      return r.data.data as NotificationStats;
    },
    staleTime: 120_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-xl border py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // FIX NOTIF-STATS-ERROR-01: shared ApiError (401/403/404/500+) +
  // retry button, matching every other admin surface.
  if (isError || !data) {
    return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">إحصاءات الإشعارات (30 يوماً)</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground">الإجمالي</p>
          <p className="text-lg font-bold tabular-nums">{formatNumber(data.total ?? 0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">غير مقروء</p>
          <p className="text-lg font-bold tabular-nums">{formatNumber(data.unread ?? 0)}</p>
        </div>
      </div>
      {data.byType?.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {data.byType.map((row) => (
            <li key={row.type} className="flex justify-between gap-2">
              <span>{row.type}</span>
              <span className="tabular-nums text-foreground">{formatNumber(row.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
