'use client';

import { useAdminSystemHealth } from '@/hooks/queries/useAdmin';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { AlertTriangle, CheckCircle2, Database, Server, Info } from 'lucide-react';
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

function latencyTone(ms: number | null | undefined): string {
  if (ms == null) return 'text-foreground';
  if (ms < 20) return 'text-emerald-600 dark:text-emerald-400';
  if (ms < 80) return 'text-amber-600 dark:text-amber-400';
  return 'text-orange-600 dark:text-orange-400';
}

export function AdminSystemHealth() {
  const { data, isLoading, isError, refetch, dataUpdatedAt, isFetching } = useAdminSystemHealth();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner label="جارٍ فحص الخدمات…" />
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

  const redis = data.redis as {
    ok: boolean;
    latencyMs: number | null;
    commandLatencyMs?: number | null;
    error?: string;
    note?: string;
  };
  const db = data.db as {
    ok: boolean;
    latencyMs: number | null;
    error?: string;
    note?: string;
  };

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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          {isFetching ? 'جارٍ التحديث…' : 'تحديث الآن'}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* DB */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Database className="h-4 w-4" />
              </div>
              <h2 className="font-semibold">قاعدة البيانات</h2>
            </div>
            <StatusPill ok={db.ok} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            زمن الاستعلام (وسيط):{' '}
            <span className={cn('font-medium tabular-nums', latencyTone(db.latencyMs))}>
              {db.latencyMs != null ? `${db.latencyMs} ms` : '—'}
            </span>
          </p>
          {db.note && (
            <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {db.note}
            </p>
          )}
          {db.error && <p className="mt-2 break-all text-xs text-destructive">{db.error}</p>}
        </div>

        {/* Redis */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Server className="h-4 w-4" />
              </div>
              <h2 className="font-semibold">Redis (الكاش)</h2>
            </div>
            <StatusPill ok={redis.ok} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            أول فحص (قد يشمل الاتصال):{' '}
            <span className={cn('font-medium tabular-nums', latencyTone(redis.latencyMs))}>
              {redis.latencyMs != null ? `${redis.latencyMs} ms` : '—'}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            زمن الأمر PING (أدق للكاش):{' '}
            <span
              className={cn(
                'font-medium tabular-nums',
                latencyTone(redis.commandLatencyMs ?? null),
              )}
            >
              {redis.commandLatencyMs != null ? `${redis.commandLatencyMs} ms` : '—'}
            </span>
          </p>
          {redis.note && (
            <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {redis.note}
            </p>
          )}
          {redis.error && (
            <p className="mt-2 break-all text-xs text-destructive">{redis.error}</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">ماذا تعني الأرقام؟</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>
            هذا فحص <strong>اتصال حي</strong> (PING / SELECT 1) وليس سرعة كل قراءة كاش في التطبيق.
          </li>
          <li>
            <strong>أقل من ~20 ms</strong> ممتاز محليًا · <strong>20–80 ms</strong> مقبول لخادم بعيد ·{' '}
            <strong>أكثر من 80 ms</strong> غالبًا شبكة أو استضافة بعيدة.
          </li>
          <li>
            إن كان «أول فحص» عاليًا و«PING» منخفضًا: الاتصال/الشبكة بطيئة، والكاش نفسه سليم.
          </li>
        </ul>
      </div>
    </div>
  );
}
