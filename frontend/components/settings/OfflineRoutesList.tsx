'use client';

/**
 * components/settings/OfflineRoutesList.tsx
 *
 * SW-WARMING-PER-ROUTE-01 / BULK-SELECT-01: per-route table with
 * retry / delete / open actions, filter tabs, and (new) multi-select
 * for bulk download / bulk delete.
 *
 * Selection UX:
 *   - Long-press (>500ms) any row enters selection mode on mobile;
 *     long-press (mouse down >500ms) works the same on desktop.
 *   - In selection mode, tapping the row toggles the checkbox. Tap
 *     outside selection mode keeps the previous behavior (the row's
 *     explicit "open" icon opens the route in a new tab).
 *   - A sticky action bar appears at the bottom when selection > 0:
 *     تحميل المحدد / حذف المحدد / تحديد الكل / إلغاء.
 *   - Rows whose route is in PROTECTED_FROM_DELETE can still be
 *     selected but the bulk delete will skip them and say so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  RefreshCw, Trash2, ExternalLink, CheckCircle2, AlertTriangle,
  Clock, MinusCircle, Loader2, Check, X, CheckSquare,
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

function rowKey(r: Row): string {
  return (r.personal ? 'personal:' : '') + r.route;
}

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

  // BULK-SELECT-01
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [confirmBulkClear, setConfirmBulkClear] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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
      case 'complete': return rows.filter((r) => r.status === 'complete');
      case 'failed':   return rows.filter((r) => r.status === 'failed');
      case 'pending':  return rows.filter((r) => r.status === 'pending' || r.status === 'missing');
      case 'all':
      default:         return rows;
    }
  }, [rows, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    complete: rows.filter((r) => r.status === 'complete').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    pending: rows.filter((r) => r.status === 'pending' || r.status === 'missing').length,
  }), [rows]);

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }

  function enterSelectionWith(key: string) {
    setSelectionMode(true);
    setSelected((prev) => new Set(prev).add(key));
  }

  function clearSelection() {
    setSelected(new Set());
    setSelectionMode(false);
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map(rowKey)));
    setSelectionMode(true);
  }

  useEffect(() => { clearSelection(); }, [filter]);

  function onRowTouchStart(r: Row) {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      enterSelectionWith(rowKey(r));
    }, 500);
  }
  function onRowTouchEnd() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }
  function onRowClick(r: Row) {
    if (longPressFired.current) { longPressFired.current = false; return; }
    if (selectionMode) toggleSelect(rowKey(r));
  }

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy((s) => new Set(s).add(key));
    try { await fn(); }
    finally {
      setBusy((s) => { const n = new Set(s); n.delete(key); return n; });
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
      if (r.succeeded === 0 && r.failed === 0) toast.info('لا يوجد مسارات فاشلة');
      else toast.success('نجح ' + r.succeeded + ' من ' + (r.succeeded + r.failed));
    } finally {
      setBulkBusy(null);
      await refresh();
    }
  }

  function clearCompletedPublic() {
    const targets = rows.filter(
      (r) => !r.personal && r.status === 'complete' && !PROTECTED_FROM_DELETE.has(r.route),
    );
    if (targets.length === 0) { toast.info('لا يوجد مسارات عامة مكتملة قابلة للحذف'); return; }
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
      for (const r of targets) total += await clearSingleRouteCache(r.route, false);
      toast.success('حُذف ' + total + ' ملف من ' + targets.length + ' صفحة');
    } finally {
      setBulkBusy(null);
      await refresh();
    }
  }

  async function bulkRetrySelected() {
    setBulkBusy('retry-selected');
    let ok = 0, fail = 0;
    try {
      for (const key of Array.from(selected)) {
        const row = rows.find((r) => rowKey(r) === key);
        if (!row) continue;
        const success = row.personal
          ? await retrySinglePersonalRoute(row.route)
          : await retrySinglePublicRoute(row.route);
        if (success) ok += 1; else fail += 1;
      }
      toast.success(
        `حمّلنا ${ok} صفحة` + (fail > 0 ? ` (فشل ${fail})` : ''),
      );
    } finally {
      setBulkBusy(null);
      clearSelection();
      await refresh();
    }
  }

  async function performBulkDelete() {
    setConfirmBulkDelete(false);
    setBulkBusy('delete-selected');
    let total = 0, skipped = 0;
    try {
      for (const key of Array.from(selected)) {
        const row = rows.find((r) => rowKey(r) === key);
        if (!row) continue;
        if (!row.personal && PROTECTED_FROM_DELETE.has(row.route)) { skipped += 1; continue; }
        total += await clearSingleRouteCache(row.route, row.personal);
      }
      const msg = skipped > 0
        ? `حُذف ${total} ملف (تجاوزنا ${skipped} صفحة محمية)`
        : `حُذف ${total} ملف من ${selected.size} صفحة`;
      toast.success(msg);
    } finally {
      setBulkBusy(null);
      clearSelection();
      await refresh();
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">تفاصيل المسارات</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          اضغط مطوّلاً على أي صف لتحديد مجموعة، ثم حمّلها أو احذفها مرة واحدة.
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
            variant={selectionMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => (selectionMode ? clearSelection() : setSelectionMode(true))}
            className="gap-1.5"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectionMode ? 'إلغاء التحديد' : 'تحديد'}
          </Button>
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

      <div className="max-h-[60vh] overflow-y-auto pb-24">
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
              const key = rowKey(row);
              const isSelected = selected.has(key);
              return (
                <li
                  key={key}
                  onTouchStart={() => onRowTouchStart(row)}
                  onTouchEnd={onRowTouchEnd}
                  onTouchCancel={onRowTouchEnd}
                  onMouseDown={(e) => { if (e.button === 0) onRowTouchStart(row); }}
                  onMouseUp={onRowTouchEnd}
                  onMouseLeave={onRowTouchEnd}
                  onClick={() => onRowClick(row)}
                  className={cn(
                    'flex flex-wrap items-center gap-2 px-3 py-2 transition-colors',
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/40',
                    selectionMode && 'cursor-pointer',
                  )}
                >
                  {(selectionMode || isSelected) && (
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                  )}

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

                  {!selectionMode && (
                    <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button" variant="ghost" size="sm"
                        onClick={() => void retryOne(row)}
                        disabled={isBusy}
                        aria-label={'إعادة تحميل ' + row.route}
                        className="h-7 w-7 p-0"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        type="button" variant="ghost" size="sm"
                        onClick={() => void deleteOne(row)}
                        disabled={isBusy || !canDelete}
                        aria-label={'حذف ' + row.route}
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <a
                        href={row.route} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={'فتح ' + row.route}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectionMode && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background/95 px-3 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <span className="text-sm font-medium">
            {selected.size} محدد
          </span>
          <Button
            type="button" variant="ghost" size="sm"
            onClick={selectAllVisible}
            disabled={bulkBusy !== null}
            className="gap-1.5"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            تحديد الكل ({filtered.length})
          </Button>
          <div className="ms-auto flex gap-2">
            <Button
              type="button" size="sm"
              onClick={() => void bulkRetrySelected()}
              disabled={bulkBusy !== null || selected.size === 0}
              className="gap-1.5"
            >
              {bulkBusy === 'retry-selected' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              حمّل المحدد
            </Button>
            <Button
              type="button" variant="destructive" size="sm"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkBusy !== null || selected.size === 0}
              className="gap-1.5"
            >
              {bulkBusy === 'delete-selected' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              احذف المحدد
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={clearSelection}
              disabled={bulkBusy !== null}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              إلغاء
            </Button>
          </div>
        </div>
      )}

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

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`حذف ${selected.size} صفحة محددة؟`}
        description="سيُحذف التسخين من الصفحات المحددة. الصفحات الشخصية والعامة سيتأثرن، لكن '/' و '/offline' محميتان ولن تُحذفا."
        confirmLabel="حذف المحدد"
        destructive
        isPending={bulkBusy === 'delete-selected'}
        onConfirm={() => void performBulkDelete()}
      />
    </div>
  );
}
