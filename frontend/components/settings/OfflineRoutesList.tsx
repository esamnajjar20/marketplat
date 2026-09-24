/**
 * components/settings/OfflineRoutesList.tsx
 *
 * SW-WARMING-PER-ROUTE-01: per-route table with retry / delete /
 * open actions. Consumed by OfflineControlClient.
 *
 * Each row shows:
 *   - Route path + personal/public badge
 *   - Status pill (complete / failed / pending / not-started)
 *   - Chunk count, attempt count, age, last error
 *   - Actions: retry, delete (if not protected), open (if online)
 *
 * Above the table: filter tabs (all / complete / failed / pending)
 * and bulk actions (retry-all-failed, clear-completed-public).
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  RefreshCw, Trash2, ExternalLink, CheckCircle2, AlertTriangle,
  Clock, MinusCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { cn } from '@/lib/utils';
import {
  getKnownRoutes,
  retrySinglePublicRoute,
  retrySinglePersonalRoute,
  clearSingleRouteCache,
  retryAllFailedRoutes,
} from '@/lib/offlineRouteShells';
import { readSnapshot, type RouteWarmingMeta } from '@/lib/offlineWarmingState';

type Filter = 'all' | 'complete' | 'failed' | 'pending';
type Status = 'complete' | 'failed' | 'pending' | 'missing';

interface Row {
  route: string;
  personal: boolean;
  status: Status;
  chunks: number;
  attempts: number;
  warmedAt: number;
  lastError: string | null;
}

const PROTECTED_FROM_DELETE = new Set(['/offline', '/']);

function formatAge(ts: number): string {
  if (!ts) return '—';
  const ms = Date.now() - ts;
  if (ms < 60_000) return Math.round(ms / 1000) + 'ث';
  if (ms < 3_600_000) return Math.round(ms / 60_000) + 'د';
  if (ms < 86_400_000) return Math.round(ms / 3_600_000) + 'س';
  return Math.round(ms / 86_400_000) + 'ي';
}

function statusPill(status: Status) {
  switch (status) {
    case 'complete':
      return { label: 'مكتمل', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: CheckCircle2 };
    case 'failed':
      return { label: 'فشل', cls: 'bg-red-100 text-red-800 border-red-300', Icon: AlertTriangle };
    case 'pending':
      return { label: 'بالانتظار', cls: 'bg-amber-100 text-amber-800 border-amber-300', Icon: Clock };
    case 'missing':
      return { label: 'لم يبدأ', cls: 'bg-zinc-100 text-zinc-600 border-zinc-300', Icon: MinusCircle };
  }
}

export function OfflineRoutesList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  // SW-FIX-ORL-CONFIRM: replace both window.confirm calls with shared
  // ConfirmDialog. Two targets — single-row delete and bulk clear-public.
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [confirmBulkClear, setConfirmBulkClear] = useState(false);

  const refresh = useCallback(async () => {
    const snap = await readSnapshot();
    const routes = getKnownRoutes();
    const next: Row[] = routes.map(({ route, personal }) => {
      const key = personal ? 'personal:' + route : route;
      const meta: RouteWarmingMeta | undefined = snap?.routes?.[key];
      return {
        route,
        personal,
        status: (meta?.status ?? 'missing') as Status,
        chunks: meta?.chunks?.length ?? 0,
        attempts: meta?.attempts ?? 0,
        warmedAt: meta?.warmedAt ?? 0,
        lastError: meta?.lastError ?? null,
      };
    });
    setRows(next);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'complete':
        return rows.filter((r) => r.status === 'complete');
      case 'failed':
        return rows.filter((r) => r.status === 'failed');
      case 'pending':
        return rows.filter((r) => r.status === 'pending' || r.status === 'missing');
      case 'all':
      default:
        return rows;
    }
  }, [rows, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    complete: rows.filter((r) => r.status === 'complete').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    pending: rows.filter((r) => r.status === 'pending' || r.status === 'missing').length,
  }), [rows]);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy((s) => new Set(s).add(key));
    try {
      await fn();
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
      await refresh();
    }
  }

  async function retryOne(row: Row) {
    const key = (row.personal ? 'p:' : '') + row.route;
    await withBusy(key, async () => {
      const ok = row.personal
        ? await retrySinglePersonalRoute(row.route)
        : await retrySinglePublicRoute(row.route);
      if (ok) toast.success('تم: ' + row.route);
      else toast.error('فشل: ' + row.route);
    });
  }

  function deleteOne(row: Row) {
    if (!row.personal && PROTECTED_FROM_DELETE.has(row.route)) {
      toast.error('لا يمكن حذف هذا المسار — أساسي للتطبيق');
      return;
    }
    setConfirmDelete(row);
  }

  async function performDelete() {
    if (!confirmDelete) return;
    const row = confirmDelete;
    setConfirmDelete(null);
    const key = (row.personal ? 'p:' : '') + row.route;
    await withBusy(key, async () => {
      const removed = await clearSingleRouteCache(row.route, row.personal);
      toast.success('حُذف ' + removed + ' ملف');
    });
  }

  async function retryAllFailed() {
    setBulkBusy('retry-all');
    try {
      const r = await retryAllFailedRoutes(3);
      if (r.succeeded === 0 && r.failed === 0) {
        toast.info('لا يوجد مسارات فاشلة');
      } else {
        toast.success('نجح ' + r.succeeded + ' من ' + (r.succeeded + r.failed));
      }
    } finally {
      setBulkBusy(null);
      await refresh();
    }
  }

  async function clearCompletedPublic() {
    const targets = rows.filter(
      (r) => !r.personal && r.status === 'complete' && !PROTECTED_FROM_DELETE.has(r.route),
    );
    if (targets.length === 0) {
      toast.info('لا يوجد مسارات عامة مكتملة قابلة للحذف');
      return;
    }
    setConfirmBulkClear(true);
  }

  async function performBulkClear() {
    setConfirmBulkClear(false);
    const targets = rows.filter(
      (r) => !r.personal && r.status === 'complete' && !PROTECTED_FROM_DELETE.has(r.route),
    );
    setBulkBusy('clear-public');
    try {
      let total = 0;
      for (const r of targets) {
        total += await clearSingleRouteCache(r.route, false);
      }
      toast.success('حُذف ' + total + ' ملف من ' + targets.length + ' صفحة');
    } finally {
      setBulkBusy(null);
      await refresh();
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">تفاصيل المسارات</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          اضغط &laquo;إعادة&raquo; لمسح محاولة فاشلة والمحاولة مجدداً. اضغط &laquo;حذف&raquo; لإزالة النسخة المحلية (يُعاد تسخينها لاحقاً).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        {(['all', 'complete', 'failed', 'pending'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              filter === f
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted',
            )}
          >
            {f === 'all' ? 'الكل' : f === 'complete' ? 'مكتمل' : f === 'failed' ? 'فشل' : 'بالانتظار'}
            {' '}
            <span className="font-mono opacity-80">({counts[f]})</span>
          </button>
        ))}
        <div className="ms-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={retryAllFailed}
            disabled={bulkBusy !== null || counts.failed === 0}
            className="gap-1.5"
          >
            {bulkBusy === 'retry-all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            أعد الفاشلة
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearCompletedPublic}
            disabled={bulkBusy !== null}
            className="gap-1.5"
          >
            {bulkBusy === 'clear-public' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            امسح العامة
          </Button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            لا توجد مسارات في هذا التصنيف.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {filtered.map((row) => {
              const { label, cls, Icon } = statusPill(row.status);
              const busyKey = (row.personal ? 'p:' : '') + row.route;
              const isBusy = busy.has(busyKey);
              const canDelete = row.personal || !PROTECTED_FROM_DELETE.has(row.route);
              return (
                <li
                  key={(row.personal ? 'p:' : '') + row.route}
                  className="flex flex-wrap items-center gap-2 px-3 py-2 hover:bg-muted/40"
                >
                  <span className={cn('flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', cls)}>
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <code className="truncate font-mono text-xs" dir="ltr">{row.route}</code>
                      {row.personal && (
                        <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">شخصي</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{row.chunks} ملف</span>
                      {row.attempts > 0 && <span>· {row.attempts} محاولة</span>}
                      {row.warmedAt > 0 && <span>· {formatAge(row.warmedAt)}</span>}
                      {row.lastError && (
                        <span className="truncate text-red-600" title={row.lastError} dir="ltr">
                          · {row.lastError}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void retryOne(row)}
                      disabled={isBusy}
                      aria-label={'إعادة تحميل ' + row.route}
                      className="h-7 w-7 p-0"
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void deleteOne(row)}
                      disabled={isBusy || !canDelete}
                      aria-label={'حذف ' + row.route}
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <a
                      href={row.route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={'فتح ' + row.route}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`حذف النسخة المخزَّنة من ${confirmDelete?.route ?? ''}؟`}
        description="سيتم حذف الملفات المُسخَّنة لهذا المسار. يُعاد تسخينها تلقائياً لاحقاً حسب الإعدادات."
        confirmLabel="حذف"
        destructive
        onConfirm={() => void performDelete()}
      />

      <ConfirmDialog
        open={confirmBulkClear}
        onOpenChange={setConfirmBulkClear}
        title="حذف التسخين للصفحات العامة المكتملة؟"
        description="لن تتأثر صفحاتك الشخصية ولا التنزيلات اليدوية."
        confirmLabel="حذف"
        destructive
        isPending={bulkBusy === 'clear-public'}
        onConfirm={() => void performBulkClear()}
      />
    </div>
  );
}
