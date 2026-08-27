'use client';

import { useAdminSystemHealth } from '@/hooks/queries/useAdmin';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { AlertTriangle, CheckCircle2, Database, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/shared/ui/Button';

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive',
      )}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {ok ? 'سليم' : 'خلل'}
    </span>
  );
}

export function AdminSystemHealth() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useAdminSystemHealth();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">تعذّر فحص صحة النظام</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  const cards = [
    {
      title: 'قاعدة البيانات',
      icon: Database,
      ok: data.db.ok,
      latency: data.db.latencyMs,
      error: data.db.error,
    },
    {
      title: 'Redis',
      icon: Server,
      ok: data.redis.ok,
      latency: data.redis.latencyMs,
      error: data.redis.error,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          آخر فحص:{' '}
          {data.checkedAt
            ? new Date(data.checkedAt).toLocaleString('ar')
            : dataUpdatedAt
              ? new Date(dataUpdatedAt).toLocaleString('ar')
              : '—'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          تحديث الآن
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ title, icon: Icon, ok, latency, error }) => (
          <div key={title} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  <Icon className="h-4 w-4" />
                </div>
                <h2 className="font-semibold">{title}</h2>
              </div>
              <StatusPill ok={ok} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              زمن الاستجابة:{' '}
              <span className="font-medium text-foreground tabular-nums">
                {latency != null ? `${latency} ms` : '—'}
              </span>
            </p>
            {error && (
              <p className="mt-2 break-all text-xs text-destructive">{error}</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        هذه الصفحة تعرض فحصاً حياً لـ PostgreSQL و Redis فقط. سجلات الأخطاء التفصيلية تُراجع من
        مخرجات الخادم أو أداة المراقبة الخارجية.
      </p>
    </div>
  );
}
