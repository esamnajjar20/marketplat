/**
 * /admin/debug/warming — read-only diagnostic view of the offline
 * warming system (routes, caches, coordination, storage).
 *
 * Not linked from any navigation. Reach it by URL:
 *   /admin/debug/warming
 *
 * Admin layout already enforces the role gate; this page does not
 * re-check auth. Pure client component — nothing here is server-safe
 * (IndexedDB, caches, navigator.connection are all browser-only).
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  buildWarmingReport,
  formatBytes,
  formatAge,
  type WarmingDebugReport,
  type RouteReport,
} from '@/lib/offlineWarmingDebug';
import { warmRouteShellsAtomic, warmPersonalShellsAtomic } from '@/lib/offlineRouteShells';
import { warmCoreBundle } from '@/lib/offlineCoreBundle';
import { clearSnapshot } from '@/lib/offlineWarmingState';
import { toast } from 'sonner';

// ── small presentational bits ───────────────────────────────────

function StatusPill({ status }: { status: RouteReport['status'] }) {
  const styles: Record<RouteReport['status'], string> = {
    complete: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    failed: 'bg-red-100 text-red-800 border-red-300',
    pending: 'bg-amber-100 text-amber-800 border-amber-300',
    missing: 'bg-zinc-100 text-zinc-600 border-zinc-300',
  };
  const labels: Record<RouteReport['status'], string> = {
    complete: 'مكتمل',
    failed: 'فشل',
    pending: 'بالانتظار',
    missing: 'لم يبدأ',
  };
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function RouteTable({
  title,
  routes,
}: {
  title: string;
  routes: RouteReport[];
}) {
  const complete = routes.filter((r) => r.status === 'complete').length;
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {complete} / {routes.length} مكتمل
        </span>
      </div>
      <div className="divide-y text-xs">
        {routes.map((r) => (
          <div key={r.route} className="flex items-center gap-2 px-4 py-1.5">
            <StatusPill status={r.status} />
            <code className="flex-1 truncate font-mono" dir="ltr">
              {r.route}
            </code>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {r.chunks}c
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {r.attempts}×
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatAge(r.warmedAt)}
            </span>
            {r.lastError && (
              <span
                className="text-[10px] text-red-600 truncate max-w-[120px]"
                title={r.lastError}
                dir="ltr"
              >
                {r.lastError}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── manual tools ────────────────────────────────────────────────

const STAGING_CACHE = 'market-warming-staging';

function ManualTools({ onDone }: { onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
      toast.success(`${label}: تم`);
      await onDone();
    } catch (e) {
      toast.error(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const clearStaging = async () => {
    const c = await caches.open(STAGING_CACHE);
    const keys = await c.keys();
    for (const k of keys) await c.delete(k);
    toast.success(`staging: حُذف ${keys.length} مدخل`);
    await onDone();
  };

  const wipeSnapshot = async () => {
    if (!confirm('حذف snapshot warming؟ سيُعاد warming من الصفر.')) return;
    await clearSnapshot();
    toast.success('snapshot: حُذف');
    await onDone();
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">أدوات يدوية</h3>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run('core', () => warmCoreBundle({ force: true }))}
            className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            {busy === 'core' ? '…' : 'أعد warming core'}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run('routes', () => warmRouteShellsAtomic())}
            className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            {busy === 'routes' ? '…' : 'أعد warming المسارات'}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run('personal', () => warmPersonalShellsAtomic())}
            className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            {busy === 'personal' ? '…' : 'أعد warming الشخصي'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => run('staging', clearStaging)}
            className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            {busy === 'staging' ? '…' : 'امسح staging'}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={wipeSnapshot}
            className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            امسح snapshot (خطر)
          </button>
        </div>
        <div className="border-t pt-3 text-[10px] text-muted-foreground">
          ملاحظة: warming يعمل في الخلفية — قد لا ترى الأثر فوراً. اضغط تحديث
          بعد 5-10 ثوانٍ.
        </div>
      </div>
    </div>
  );
}

// ── the page ────────────────────────────────────────────────────

export default function WarmingDebugPage() {
  const [report, setReport] = useState<WarmingDebugReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await buildWarmingReport();
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (loading && !report) {
    return (
      <div dir="rtl" className="p-6 text-sm text-muted-foreground">
        جارٍ التحميل…
      </div>
    );
  }

  if (error) {
    return (
      <div dir="rtl" className="p-6">
        <p className="text-sm text-red-600">فشل: {error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-3 rounded border px-3 py-1 text-xs"
        >
          أعد المحاولة
        </button>
      </div>
    );
  }

  if (!report) return null;

  const planTierLabels: Record<string, string> = {
    none: 'معطّل',
    critical: 'حرج فقط',
    core: 'أساسي',
    full: 'كامل',
  };

  return (
    <div dir="rtl" className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">تشخيص warming</h1>
          <p className="text-xs text-muted-foreground">
            آخر تحديث: {new Date(report.generatedAt).toLocaleTimeString('ar')}{' '}
            — يُحدَّث تلقائياً كل 10 ثوانٍ
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          {loading ? '…' : 'تحديث'}
        </button>
      </div>

      {/* ── top summary grid ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground">الشبكة</p>
          <p className="mt-1 text-sm font-medium">
            {report.online ? 'متصل' : 'غير متصل'}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground">
            خطة warming
          </p>
          <p className="mt-1 text-sm font-medium">
            {planTierLabels[report.plan.tier] ?? report.plan.tier}
          </p>
          <p className="text-[10px] text-muted-foreground" dir="ltr">
            {report.plan.reason}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground">التنسيق</p>
          <p className="mt-1 text-sm font-medium" dir="ltr">
            {report.coordination}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] uppercase text-muted-foreground">
            liveUrls
          </p>
          <p className="mt-1 text-sm font-medium tabular-nums">
            {report.liveUrlsCount}
          </p>
        </div>
      </div>

      <ManualTools onDone={refresh} />

      {/* ── storage ── */}
      {report.storage && report.storage.quota > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">التخزين</span>
            <span className="tabular-nums" dir="ltr">
              {formatBytes(report.storage.usage)} /{' '}
              {formatBytes(report.storage.quota)} ({report.storage.usagePct}%)
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${
                report.storage.usagePct > 80
                  ? 'bg-red-500'
                  : report.storage.usagePct > 50
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, report.storage.usagePct)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── throttle ── */}
      <div className="rounded-lg border bg-card p-3">
        <h3 className="text-sm font-semibold">Throttle (آخر مرة)</h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-[10px] text-muted-foreground">route shells</p>
            <p className="tabular-nums" dir="ltr">
              {formatAge(report.throttle.routeShells || null)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">personal</p>
            <p className="tabular-nums" dir="ltr">
              {formatAge(report.throttle.personalShells || null)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">core bundle</p>
            <p className="tabular-nums" dir="ltr">
              {formatAge(report.throttle.coreBundle || null)}
            </p>
          </div>
        </div>
      </div>

      {/* ── caches ── */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">الكاشات</h3>
        </div>
        <div className="divide-y text-xs">
          {report.caches.map((c) => (
            <div
              key={c.name}
              className="flex items-center justify-between px-4 py-1.5"
            >
              <code className="font-mono text-[11px]" dir="ltr">
                {c.name}
              </code>
              <div className="flex gap-3 tabular-nums text-muted-foreground">
                <span>{c.entries} entries</span>
                <span className="w-20 text-end" dir="ltr">
                  {formatBytes(c.approxBytes)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── route tables ── */}
      <RouteTable title="مسارات عامة" routes={report.publicRoutes} />
      <RouteTable title="مسارات شخصية" routes={report.personalRoutes} />

      <p className="text-center text-[10px] text-muted-foreground">
        هذه الصفحة للقراءة فقط — لا تعدّل warming. لأدوات يدوية، استخدم
        Console.
      </p>
    </div>
  );
}
