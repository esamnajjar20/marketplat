/**
 * components/settings/OfflineControlClient.tsx
 *
 * SW-WARMING-USER-CONTROL-01: main UI for /settings/offline.
 *
 * Reads:
 *   - warmingPreferences (localStorage): current mode.
 *   - offlineWarmingState snapshot (IndexedDB): live route status.
 *   - navigator.storage.estimate(): cache size.
 *
 * Writes:
 *   - warmingPreferences: mode changes.
 *   - via buttons: re-run warming now (warmRouteShellsAtomic), clear
 *     warming caches.
 *
 * Polls the snapshot every 10 seconds so the numbers stay fresh
 * without the user having to manually refresh — warming runs in the
 * background on its own schedule, and this page exists to make that
 * visible.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Wifi, WifiOff, DownloadCloud, Trash2, Info, Loader2, Hourglass,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { cn } from '@/lib/utils';
import {
  getWarmingMode,
  setWarmingMode,
  WARMING_MODE_LABELS,
  WARMING_MODE_DESCRIPTIONS,
  WARMING_MODE_BYTES_EST,
  type WarmingMode,
} from '@/lib/warmingPreferences';
import { readSnapshot } from '@/lib/offlineWarmingState';
import { warmRouteShellsAtomic, warmPersonalShellsAtomic, getDripProgress } from '@/lib/offlineRouteShells';
import { warmUserData } from '@/lib/offlineWarmingUserData';
import { OfflineRoutesList } from './OfflineRoutesList';

const MODES: WarmingMode[] = ['auto', 'balanced', 'saver', 'drip', 'off'];

interface Snapshot {
  publicComplete: number;
  publicTotal: number;
  personalComplete: number;
  personalTotal: number;
  lastWarmedAt: number;
  cacheVersion: string;
  liveUrlsCount: number;
}

interface StorageInfo {
  usage: number;
  quota: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatAge(ts: number): string {
  if (!ts) return '—';
  const ms = Date.now() - ts;
  if (ms < 60_000) return 'قبل ' + Math.round(ms / 1000) + ' ث';
  if (ms < 3_600_000) return 'قبل ' + Math.round(ms / 60_000) + ' د';
  if (ms < 86_400_000) return 'قبل ' + Math.round(ms / 3_600_000) + ' س';
  return 'قبل ' + Math.round(ms / 86_400_000) + ' ي';
}

export function OfflineControlClient() {
  const [mode, setMode] = useState<WarmingMode>('auto');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  // SW-FIX-OCC-CONFIRM: replace window.confirm with shared ConfirmDialog.
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [dripProgress, setDripProgress] = useState<{
    complete: number;
    total: number;
    nextInMs: number;
  } | null>(null);

  const readSnapshotLive = useCallback(async () => {
    try {
      const s = await readSnapshot();
      if (!s) {
        setSnapshot({
          publicComplete: 0,
          publicTotal: 12,
          personalComplete: 0,
          personalTotal: 33,
          lastWarmedAt: 0,
          cacheVersion: '',
          liveUrlsCount: 0,
        });
        return;
      }
      const routes = s.routes || {};
      let pubComplete = 0;
      let personalComplete = 0;
      let lastWarmedAt = 0;
      for (const [key, meta] of Object.entries(routes)) {
        const isPersonal = key.startsWith('personal:');
        if (meta?.status === 'complete') {
          if (isPersonal) personalComplete += 1;
          else pubComplete += 1;
        }
        if (meta?.warmedAt && meta.warmedAt > lastWarmedAt) {
          lastWarmedAt = meta.warmedAt;
        }
      }
      setSnapshot({
        publicComplete: pubComplete,
        publicTotal: 12,
        personalComplete,
        personalTotal: 33,
        lastWarmedAt,
        cacheVersion: s.cacheVersion || '',
        liveUrlsCount: s.liveUrls.length,
      });
    } catch {
      // IndexedDB unavailable — leave the previous state
    }
  }, []);

  const readStorage = useCallback(async () => {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      }
    } catch {
      // silent
    }
  }, []);

  const refreshDrip = useCallback(() => {
    if (getWarmingMode() !== 'drip') {
      setDripProgress(null);
      return;
    }
    void getDripProgress()
      .then((p) => {
        setDripProgress({
          complete: p.complete,
          total: p.total,
          nextInMs: p.nextInMs,
        });
      })
      .catch(() => undefined);
  }, []);

  // Poll snapshot + storage every 10s
  useEffect(() => {
    void readSnapshotLive();
    void readStorage();
    setMode(getWarmingMode());
    refreshDrip();
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const id = window.setInterval(() => {
      void readSnapshotLive();
      void readStorage();
      refreshDrip();
    }, 10_000);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [readSnapshotLive, readStorage, refreshDrip]);

  function handleModeChange(next: WarmingMode) {
    setMode(next);
    setWarmingMode(next);
    // Defer so getWarmingMode() inside refreshDrip sees the new value.
    // SW-FIX-DRIP-QUEUE-TYPO: was `queue.setTimeout` — ReferenceError
    // (queue undefined) fired every time the user changed mode.
    window.setTimeout(() => refreshDrip(), 0);
    toast.success('تم حفظ الإعداد: ' + WARMING_MODE_LABELS[next]);
  }

  async function handleWarmNow() {
    setBusy('warm');
    try {
      await Promise.allSettled([
        warmRouteShellsAtomic(),
        warmPersonalShellsAtomic(),
        warmUserData(),
      ]);
      await readSnapshotLive();
      await readStorage();
      refreshDrip();
      toast.success('تم تشغيل التسخين — قد يستغرق دقيقة');
    } finally {
      setBusy(null);
    }
  }

  function handleClearWarming() {
    setConfirmClearOpen(true);
  }

  async function performClearWarming() {
    setBusy('clear');
    try {
      const names = await caches.keys();
      let cleared = 0;
      for (const n of names) {
        // Only warming-owned caches. NOT images (user content),
        // NOT saved-ads (explicit user action), NOT user-data
        // (which is refreshed by warming anyway).
        if (
          n.startsWith('market-static-') ||
          n.startsWith('market-personal-shell-') ||
          n.startsWith('market-core-') ||
          n.startsWith('market-warming-staging')
        ) {
          const ok = await caches.delete(n);
          if (ok) cleared += 1;
        }
      }
      toast.success('تم مسح ' + cleared + ' كاشات warming');
      await readSnapshotLive();
      await readStorage();
    } finally {
      setBusy(null);
    }
  }

  const pct = storage && storage.quota > 0
    ? Math.round((storage.usage / storage.quota) * 100)
    : 0;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
        <p>
          على بطاقات النت الضعيفة (حوالي 17–30 ك.ب/ث) يُفضَّل وضع
          «وفّر البيانات» أو «معطّل» حتى لا يستهلك التحضير التلقائي رصيدك.
          الصفحات التي تزورها وأنت متصل تُحفظ تلقائياً للاستخدام لاحقاً.
        </p>
      </div>


      {/* Status banner */}
      <div className={cn(
        'flex items-center gap-3 rounded-xl border p-3 text-sm',
        online ? 'border-emerald-300/40 bg-emerald-50 text-emerald-800' : 'border-amber-300/40 bg-amber-50 text-amber-800',
      )}>
        {online ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
        <span>{online ? 'متصل — التسخين يعمل في الخلفية' : 'غير متصل — التسخين سيعمل عند عودة الاتصال'}</span>
      </div>

      {/* Mode selection */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">مستوى التسخين</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            التسخين = تحضير الصفحات مسبقاً لتعمل عند انقطاع الإنترنت.
          </p>
        </div>
        <div className="divide-y">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={cn(
                'flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/50',
                mode === m && 'bg-primary/5',
              )}
            >
              <span
                className={cn(
                  'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                  mode === m ? 'border-primary' : 'border-muted-foreground/40',
                )}
              >
                {mode === m && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{WARMING_MODE_LABELS[m]}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {WARMING_MODE_BYTES_EST[m]}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground leading-relaxed">
                  {WARMING_MODE_DESCRIPTIONS[m]}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">الحالة الحالية</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">صفحات عامة</p>
            <p className="mt-0.5 font-mono font-semibold">
              {snapshot ? snapshot.publicComplete + ' / ' + snapshot.publicTotal : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">صفحات شخصية</p>
            <p className="mt-0.5 font-mono font-semibold">
              {snapshot ? snapshot.personalComplete + ' / ' + snapshot.personalTotal : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">آخر تسخين</p>
            <p className="mt-0.5 font-mono text-xs">
              {snapshot ? formatAge(snapshot.lastWarmedAt) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">عدد الملفات المُخزَّنة</p>
            <p className="mt-0.5 font-mono text-xs">
              {snapshot ? snapshot.liveUrlsCount : '—'}
            </p>
          </div>
        </div>

        {storage && (
          <div className="mt-4 border-t pt-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">المساحة المستخدمة</span>
              <span className="font-mono">
                {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
                {storage.quota > 0 && ' (' + pct + '%)'}
              </span>
            </div>
            {storage.quota > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500',
                  )}
                  style={{ width: Math.min(100, pct) + '%' }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual controls */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">إجراءات</h2>
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleWarmNow}
            disabled={busy !== null || !online}
          >
            {busy === 'warm' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
            سخّن الآن (يستهلك بيانات)
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleClearWarming}
            disabled={busy !== null}
          >
            {busy === 'clear' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            امسح التسخين التلقائي
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            مسح التسخين لا يؤثر على التنزيلات، ولا الإعلانات المحفوظة يدوياً،
            ولا بيانات المتجر. سيُعاد التسخين تلقائياً حسب الإعداد أعلاه.
          </span>
        </p>
      </div>

      {/* SW-WARMING-PER-ROUTE-01: per-route table with retry / delete /
          open actions and filter tabs. Reads the same snapshot this
          component already polls, but manages its own refresh cadence
          (5s) so a single retry doesn't wait for the parent's 10s tick. */}
      
      {mode === 'drip' && dripProgress && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Hourglass className="h-3.5 w-3.5" aria-hidden />
            تقدّم الدورة: {dripProgress.complete}/{dripProgress.total} صفحة
          </div>
          <p className="mt-0.5">
            {dripProgress.nextInMs > 0
              ? `الدورة التالية بعد: ${Math.max(1, Math.round(dripProgress.nextInMs / 60000))} دقائق`
              : 'جاهز لدورة جديدة عند التحديث أو عودة الاتصال'}
          </p>
        </div>
      )}

      <OfflineRoutesList />

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="مسح التسخين التلقائي؟"
        description="سيُمسح كل التسخين التلقائي (الصفحات المحضّرة مسبقاً). لن تُمس التنزيلات اليدوية ولا الإعلانات المحفوظة."
        confirmLabel="مسح"
        destructive
        isPending={busy === 'clear'}
        onConfirm={() => {
          setConfirmClearOpen(false);
          void performClearWarming();
        }}
      />
    </div>
  );
}
