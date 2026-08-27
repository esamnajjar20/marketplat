'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { adminApi } from '@/api/admin.api';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export function NotificationStatsCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'notifications', 'stats', 30],
    queryFn: () => adminApi.getNotificationStats({ days: 30 }).then((r) => r.data.data),
    staleTime: 120_000,
  });

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">إحصاءات الإشعارات (30 يوماً)</h2>
      </div>

      {isLoading && (
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      )}
      {isError && (
        <p className="text-sm text-destructive">تعذّر تحميل إحصاءات الإشعارات</p>
      )}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-lg font-bold tabular-nums">{data.total}</p>
              <p className="text-[11px] text-muted-foreground">إجمالي</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-lg font-bold tabular-nums">{data.unread}</p>
              <p className="text-[11px] text-muted-foreground">غير مقروء</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-lg font-bold tabular-nums">
                {data.readRate == null ? '—' : `${data.readRate}%`}
              </p>
              <p className="text-[11px] text-muted-foreground">نسبة القراءة</p>
            </div>
          </div>
          {data.byType.length > 0 && (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto text-sm">
              {data.byType.map((row) => (
                <li
                  key={row.type}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
                >
                  <span className="font-mono text-xs text-muted-foreground">{row.type}</span>
                  <span className="tabular-nums font-medium">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
