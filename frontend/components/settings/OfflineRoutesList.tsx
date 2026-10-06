'use client';

/**
 * components/settings/OfflineRoutesList.tsx
 *
 * SW-WARMING-PER-ROUTE-01 / BULK-SELECT-01: per-route table with
 * retry / delete / open actions, filter tabs, and (new) multi-select
 * for bulk download / bulk delete.
 *
 * Selection UX:
 *   - Long-press (~900ms) any row enters selection mode on touch/pen.
 *     Mouse interaction keeps its normal behavior.
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
import { useLongPress } from '@/hooks/ui/useLongPress';
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

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function statusPill(status: Status) {
  switch (status) {
    case 'complete':
      return { label: 'مكتمل', cls: 'bg-success/10 text-success border-success/30', Icon: CheckCircle2 };
    case 'failed':
      return { label: 'فشل', cls: 'bg-destructive/10 text-destructive border-destructive/30', Icon: AlertTriangle };
    case 'pending':
      return { label: 'بالانتظار', cls: 'bg-warning/10 text-warning-strong border-warning/30', Icon: Clock };
    case 'missing':
      return { label: 'لم يبدأ', cls: 'bg-muted text-muted-foreground border-border', Icon: MinusCircle };
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
  const longPressTargetRef = useRef<string | null>(null);
  const longPressHandlers = useLongPress(() => {
    const key = longPressTargetRef.current;
    if (key) {
      setSelectionMode(true);
      setSelected((prev) => new Set(prev).add(key));
    }
  }, { enabled: !selectionMode });

  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [confirmBulkClear, setConfirmBulkClear] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  // SIZE-ACTIONS-01: confirm for 'clear largest'. A one-click way to
  // reclaim space when the storage bar starts filling. Deletes the N
  // largest routes, skipping protected ones.
  const [confirmBulkClearLargest, setConfirmBulkClearLargest] = useState(false);

  // SIZE-SORT-01: per-route Cache Storage footprint. Computing one route
  // requires matching every chunk against the relevant cache and
  // reading blob size — expensive enough to run ONCE per mount rather
  // than on every 5s refresh tick. Empty map = not computed yet.
  const [sizes, setSizes] = useState<Map<string, number>>(new Map());
  // FIX WARM-SIZE-DEDUPE-01: chunks are shared across routes (~89% overlap),
  // so summing per-route sizes counted the same bytes many times (the header
  // showed 30 MB while the device really held ~23 MB). This is the size of
  // the UNIQUE chunks only; per-row sizes stay as "what this route needs".
  const [uniqueBytes, setUniqueBytes] = useState<number | null>(null);
  // Bumped after bulk deletes so the (unique) total is recomputed from the cache.
  const [sizesTick, setSizesTick] = useState(0);
  const [sizesComputing, setSizesComputing] = useState(false);
  const [sortMode, setSortMode] = useState<'default' | 'size' | 'fresh'>('default');

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

  // SIZE-SORT-01: one-shot computation. Chunks live in STATIC_CACHE
  // (both for public and personal routes — see offlineRouteShells.ts's
  // own comment on that); the HTML/RSC for personal routes lives in
  // PERSONAL_SHELL_CACHE. We just check every relevant cache for each
  // chunk path and take the first hit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof caches === 'undefined') return;
      setSizesComputing(true);
      try {
        const snap = await readSnapshot();
        const routes = getKnownRoutes();
        const cacheNames = await caches.keys();
        const staticName = cacheNames.find((n) => n.startsWith('market-static-'));
        const personalName = cacheNames.find((n) => n.startsWith('market-personal-shell-'));
        const opened: Cache[] = [];
        if (staticName) opened.push(await caches.open(staticName));
        if (personalName) opened.push(await caches.open(personalName));
        if (opened.length === 0) {
          setSizesComputing(false);
          return;
        }

        const next = new Map<string, number>();
        const seenChunks = new Set<string>();
        let uniqueSum = 0;
        for (const { route, personal } of routes) {
          if (cancelled) return;
          const key = personal ? 'personal:' + route : route;
          const meta = snap?.routes?.[key];
          if (!meta?.chunks?.length) { next.set(key, 0); continue; }
          let total = 0;
          for (const chunkPath of meta.chunks) {
            for (const cache of opened) {
              const hit = await cache.match(chunkPath).catch(() => undefined);
              if (hit) {
                try {
                  const size = (await hit.clone().blob()).size;
                  total += size;
                  if (!seenChunks.has(chunkPath)) {
                    seenChunks.add(chunkPath);
                    uniqueSum += size;
                  }
                } catch { /* ignore */ }
                break;
              }
            }
          }
          next.set(key, total);
        }
        if (!cancelled) {
          setSizes(next);
          setUniqueBytes(uniqueSum);
        }
      } catch { /* best-effort */ }
      finally { if (!cancelled) setSizesComputing(false); }
    })();
    return () => { cancelled = true; };
  }, [sizesTick]);

  const filtered = useMemo(() => {
    let list: Row[];
    switch (filter) {
      case 'complete': list = rows.filter((r) => r.status === 'complete'); break;
      case 'failed':   list = rows.filter((r) => r.status === 'failed'); break;
      case 'pending':  list = rows.filter((r) => r.status === 'pending' || r.status === 'missing'); break;
      case 'all':
      default:         list = rows;
    }
    if (sortMode === 'size') {
      return [...list].sort((a, b) => {
        const sa = sizes.get(rowKey(a)) ?? -1;
        const sb = sizes.get(rowKey(b)) ?? -1;
        return sb - sa;
      });
    }
    if (sortMode === 'fresh') {
      return [...list].sort((a, b) => b.warmedAt - a.warmedAt);
    }
    return list;
  }, [rows, filter, sortMode, sizes]);

  const counts = useMemo(() => ({
    all: rows.length,
    complete: rows.filter((r) => r.status === 'complete').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    pending: rows.filter((r) => r.status === 'pending' || r.status === 'missing').length,
  }), [rows]);

  // SIZE-ACTIONS-01: aggregate size across all routes that have a
  // computed size. Includes filtered-out rows — 'size on disk'
  // shouldn't change when the user toggles a filter.
  const totalBytes = useMemo(() => {
    if (uniqueBytes !== null) return uniqueBytes;
    let sum = 0;
    for (const v of sizes.values()) sum += v;
    return sum;
  }, [sizes, uniqueBytes]);

  // Top 5 largest deletable routes.
  const largestRoutes = useMemo(() => {
    const LARGEST_COUNT = 5;
    return rows
      .map((r) => ({ row: r, bytes: sizes.get(rowKey(r)) ?? 0 }))
      .filter(({ row, bytes }) => bytes > 0 && (row.personal || !PROTECTED_FROM_DELETE.has(row.route)))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, LARGEST_COUNT);
  }, [rows, sizes]);

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
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

  // SIZE-ACTIONS-01: delete the largest N routes' caches. Uses the
  // same clearSingleRouteCache path as the selection toolbar, so the
  // snapshot and IndexedDB cleanup behave identically. Protected
  // routes are excluded by the filter that built largestRoutes.
  async function performBulkClearLargest() {
    setConfirmBulkClearLargest(false);
    setBulkBusy('clear-largest');
    let total = 0;
    try {
      for (const { row } of largestRoutes) {
        total += await clearSingleRouteCache(row.route, row.personal);
      }
      toast.success('حُذف ' + total + ' ملف من ' + largestRoutes.length + ' صفحة');
      const cleared = new Set(largestRoutes.map(({ row }) => rowKey(row)));
      setSizes((prev) => {
        const next = new Map(prev);
        for (const k of cleared) next.set(k, 0);
        return next;
      });
      setSizesTick((t) => t + 1);
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
          اضغط «تحديد» أولاً، ثم اختر الصفوف المطلوبة لتحميلها أو حذفها مرة واحدة.
        </p>
        {sizesComputing ? (
          <p className="mt-1 text-xs text-muted-foreground">حساب الأحجام…</p>
        ) : totalBytes > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            إجمالي الكاش المُسخَّن:{' '}
            <span className="font-mono font-medium text-foreground">
              {formatBytes(totalBytes)}
            </span>
          </p>
        ) : null}
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
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
          aria-label="ترتيب الصفحات"
          className="rounded-full border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="default">الترتيب الافتراضي</option>
          <option value="size" disabled={sizesComputing}>الحجم (الأكبر)</option>
          <option value="fresh">الأحدث تسخيناً</option>
        </select>
        {sizesComputing && (
          <span className="text-2xs text-muted-foreground">حساب الأحجام…</span>
        )}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmBulkClearLargest(true)}
            disabled={bulkBusy !== null || largestRoutes.length === 0}
            title={
              largestRoutes.length > 0
                ? 'حذف أثقل ' + largestRoutes.length + ' صفحة'
                : 'انتظر حساب الأحجام'
            }
            className="gap-1.5"
          >
            {bulkBusy === 'clear-largest' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            امسح الأكبر
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
                  onPointerDown={(event) => { longPressTargetRef.current = key; longPressHandlers.onPointerDown(event); }}
                  onPointerMove={longPressHandlers.onPointerMove}
                  onPointerUp={longPressHandlers.onPointerUp}
                  onPointerCancel={longPressHandlers.onPointerCancel}
                  onClickCapture={longPressHandlers.onClickCapture}
                  onContextMenu={longPressHandlers.onContextMenu}
                  onClick={() => { if (selectionMode) toggleSelect(key); }}
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

                  <span className={cn('flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium', cls)}>
                    <Icon className="h-3 w-3" />
                    {label}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <code className="truncate font-mono text-xs" dir="ltr">{row.route}</code>
                      {row.personal && (
                        <span className="rounded bg-primary/10 px-1.5 text-2xs text-primary">شخصي</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
                      <span>{row.chunks} ملف</span>
                      {(() => {
                        const bytes = sizes.get(rowKey(row));
                        return bytes !== undefined && bytes > 0 ? (
                          <span>· {formatBytes(bytes)}</span>
                        ) : null;
                      })()}
                      {row.attempts > 0 && <span>· {row.attempts} محاولة</span>}
                      {row.warmedAt > 0 && <span>· {formatAge(row.warmedAt)}</span>}
                      {row.lastError && (
                        <span className="truncate text-destructive" title={row.lastError} dir="ltr">
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

      <ConfirmDialog
        open={confirmBulkClearLargest}
        onOpenChange={setConfirmBulkClearLargest}
        title={`حذف أثقل ${largestRoutes.length} صفحة؟`}
        description={
          'سيُفرَّغ الكاش المُسخَّن لهذه الصفحات ('
          + formatBytes(largestRoutes.reduce((s, { bytes }) => s + bytes, 0))
          + ' تقريباً). يُعاد تسخينها تلقائياً خلال الدورة القادمة.'
        }
        confirmLabel="حذف"
        destructive
        isPending={bulkBusy === 'clear-largest'}
        onConfirm={() => void performBulkClearLargest()}
      />
    </div>
  );
}
