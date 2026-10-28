'use client';

import { useState } from 'react';
import { useAdminPlatformTrends } from '@/hooks/queries/useAdmin';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { AlertTriangle } from 'lucide-react';
import { formatNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const RANGES = [
  { label: '7 أيام', days: 7 },
  { label: '30 يوماً', days: 30 },
] as const;

type Metric = 'users' | 'ads' | 'reports';

const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: 'users', label: 'مستخدمون جدد', color: 'bg-primary' },
  { key: 'ads', label: 'إعلانات جديدة', color: 'bg-accent' },
  { key: 'reports', label: 'بلاغات', color: 'bg-destructive' },
];

export function AdminPlatformTrends() {
  const [days, setDays] = useState<7 | 30>(30);
  const [metric, setMetric] = useState<Metric>('users');
  const { data, isLoading, isError, refetch } = useAdminPlatformTrends(days);

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-xl border py-12">
        <LoadingSpinner />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border py-8">
        <AlertTriangle className="h-7 w-7 text-muted-foreground" />
        <p className="text-sm text-destructive">تعذّر تحميل الاتجاهات</p>
        {/* FIX POLISH-NATIVE-BUTTON-01: shared Button primitive. */}
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  const series: Array<{ date: string; users: number; ads: number; reports: number }> = data.series ?? [];
  const max = Math.max(1, ...series.map((s) => s[metric] ?? 0));
  const total = series.reduce((acc, s) => acc + (s[metric] ?? 0), 0);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">اتجاه المنصة</h2>
          <p className="text-xs text-muted-foreground">
            إجمالي الفترة: {formatNumber(total)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs',
                days === r.days && 'bg-primary text-primary-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              metric === m.key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex h-36 items-end gap-0.5 sm:gap-1">
        {series.map((point) => {
          const v = point[metric] ?? 0;
          const h = Math.max(2, Math.round((v / max) * 100));
          return (
            <div
              key={point.date}
              className="group relative flex flex-1 flex-col items-center justify-end"
              title={`${point.date}: ${v}`}
            >
              <div
                className={cn(
                  'w-full max-w-[12px] rounded-t-sm transition-[height] duration-300',
                  METRICS.find((m) => m.key === metric)?.color ?? 'bg-primary',
                )}
                style={{ height: `${h}%` }}
              />
              <span className="pointer-events-none absolute -top-6 hidden rounded bg-foreground px-1.5 py-0.5 text-2xs text-background group-hover:block">
                {v}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-2xs text-muted-foreground">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </section>
  );
}
