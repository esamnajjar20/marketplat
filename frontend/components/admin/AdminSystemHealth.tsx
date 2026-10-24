'use client';

import { useAdminSystemHealth } from '@/hooks/queries/useAdmin';
import { ApiError } from '@/components/shared/ApiError';
import { parseApiError } from '@/lib/errorParser';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { AlertTriangle, CheckCircle2, Database, Server, Info, Cpu, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/shared/ui/Button';

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-bold',
        ok ? 'bg-[#E8F1EC] text-[#1F4D33]' : 'bg-[#FBE9E7] text-[#9B2118]',
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {ok ? 'سليم' : 'خلل'}
    </span>
  );
}

function latencyTone(ms: number | null | undefined): string {
  if (ms == null) return 'text-foreground';
  if (ms < 20) return 'text-success dark:text-success';
  if (ms < 80) return 'text-warning';
  return 'text-warning-strong';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days} يوم` : '', hours ? `${hours} ساعة` : '', `${minutes} دقيقة`].filter(Boolean).join(' و ');
}

export function AdminSystemHealth() {
  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } = useAdminSystemHealth();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner label="جارٍ فحص الخدمات…" />
      </div>
    );
  }

  // Shared ApiError for 401/403/404/500+ differentiation, consistent
  // with other admin surfaces. A valid response with both services down
  // still renders the real failure details below.
  if (isError) {
    return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">لا توجد بيانات صحة للنظام.</p>
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
            ? new Date(data.checkedAt).toLocaleString('ar', { timeZone: 'Asia/Gaza' })
            : dataUpdatedAt
              ? new Date(dataUpdatedAt).toLocaleString('ar', { timeZone: 'Asia/Gaza' })
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
        <div className="rounded-[14px] border border-[#EAE3D6] bg-card p-4 shadow-[0_1px_3px_rgba(42,36,29,0.05)] shadow-sm">
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
        <div className="rounded-[14px] border border-[#EAE3D6] bg-card p-4 shadow-[0_1px_3px_rgba(42,36,29,0.05)] shadow-sm">
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

      {data.runtime && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[14px] border border-[#EAE3D6] bg-card p-4 shadow-[0_1px_3px_rgba(42,36,29,0.05)]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Gauge className="h-4 w-4" /> مدة تشغيل الخادم</div>
            <p className="mt-2 text-lg font-semibold">{formatUptime(data.runtime.uptimeSeconds)}</p>
            <p className="mt-1 text-xs text-muted-foreground">منذ آخر إعادة تشغيل لعملية Node.js</p>
          </div>
          <div className="rounded-[14px] border border-[#EAE3D6] bg-card p-4 shadow-[0_1px_3px_rgba(42,36,29,0.05)]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Cpu className="h-4 w-4" /> ذاكرة Heap المستخدمة</div>
            <p className="mt-2 text-lg font-semibold">{formatBytes(data.runtime.memoryHeapUsedBytes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">من أصل {formatBytes(data.runtime.memoryHeapTotalBytes)} مخصصة للـ Heap</p>
            {typeof data.runtime.memoryHeapUsedPercent === 'number' && <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="نسبة استخدام Heap" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, data.runtime.memoryHeapUsedPercent))}>
                <div className={cn('h-full rounded-full transition-all', data.runtime.memoryHeapUsedPercent >= 90 ? 'bg-destructive' : data.runtime.memoryHeapUsedPercent >= 75 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, Math.max(0, data.runtime.memoryHeapUsedPercent))}%` }} />
              </div>
              <p className={cn('mt-1 text-xs', data.runtime.memoryHeapUsedPercent >= 90 ? 'text-destructive' : data.runtime.memoryHeapUsedPercent >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                {data.runtime.memoryHeapUsedPercent}% مستخدم{data.runtime.memoryHeapUsedPercent >= 90 ? ' — راجع احتمال ضغط الذاكرة' : data.runtime.memoryHeapUsedPercent >= 75 ? ' — راقب الاتجاه مع الوقت' : ''}
              </p>
            </>}
          </div>
          <div className="rounded-[14px] border border-[#EAE3D6] bg-card p-4 shadow-[0_1px_3px_rgba(42,36,29,0.05)]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Server className="h-4 w-4" /> ذاكرة العملية (RSS)</div>
            <p className="mt-2 text-lg font-semibold">{formatBytes(data.runtime.memoryRssBytes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">تشمل الذاكرة المقيمة للعملية، وليست حد ذاكرة الحاوية</p>
          </div>
          <div className="rounded-[14px] border border-[#EAE3D6] bg-card p-4 shadow-[0_1px_3px_rgba(42,36,29,0.05)]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Info className="h-4 w-4" /> بيئة التشغيل</div>
            <p className="mt-2 text-lg font-semibold">{data.runtime.environment === 'production' ? 'إنتاج' : data.runtime.environment === 'test' ? 'اختبار' : data.runtime.environment === 'development' ? 'تطوير' : data.runtime.environment}</p>
            <p className="mt-1 text-xs text-muted-foreground">Node.js {data.runtime.nodeVersion}</p>
          </div>
        </div>
      )}

      {data.backgroundWork && (
        <section className="space-y-3 rounded-xl border p-4" aria-label="صحة المهام الخلفية">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">المهام الخلفية وطابور الأحداث</h3>
              <p className="mt-1 text-sm text-muted-foreground">عدادات مباشرة من قاعدة البيانات للمهام غير المعالجة والفاشلة؛ لا تثبت وحدها أن العامل الخلفي يعمل.</p>
            </div>
            <span className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              !data.backgroundWork.available
                ? 'bg-muted text-muted-foreground'
                : (data.backgroundWork.deadLetterOutbox ?? 0) > 0 || (data.backgroundWork.staleOutbox ?? 0) > 0 || (data.backgroundWork.unresolvedFailedTasks ?? 0) > 0
                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            )}>
              {!data.backgroundWork.available ? 'البيانات غير متاحة' : (data.backgroundWork.deadLetterOutbox ?? 0) > 0 || (data.backgroundWork.staleOutbox ?? 0) > 0 || (data.backgroundWork.unresolvedFailedTasks ?? 0) > 0 ? 'تحتاج مراجعة' : 'لا توجد مؤشرات تراكم'}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['أحداث بانتظار المعالجة', data.backgroundWork.pendingOutbox],
              ['أحداث في قائمة الفشل النهائي', data.backgroundWork.deadLetterOutbox],
              ['أحداث قديمة/متأخرة', data.backgroundWork.staleOutbox],
              ['مهام فاشلة غير محلولة', data.backgroundWork.unresolvedFailedTasks],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{value == null ? '—' : value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {data.backgroundWork.note ?? `آخر قراءة: ${new Date(data.backgroundWork.checkedAt).toLocaleString('ar-PS')}. الأحداث المتأخرة محسوبة بعتبة خمس دقائق؛ اضغط تحديث الآن لإعادة الفحص بعد انتهاء التخزين المؤقت.`}
          </p>
        </section>
      )}

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
