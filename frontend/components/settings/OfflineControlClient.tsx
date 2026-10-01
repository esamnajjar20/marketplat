/**
 * components/settings/OfflineControlClient.tsx
 *
 * UI for /settings/offline. Warming is user-driven:
 *   - "ابدأ التسخين الآن" runs the current mode (force=true).
 *   - "ألغِ" stops the in-flight pass, whether started here or by the
 *     background 6h timer / mount bootstrap.
 *   - "أكمل الناقص" retries only pending/failed routes.
 *   - "أعد التحميل من الصفر" wipes route caches and re-warms.
 *   - "امسح كل التسخين" deletes warming caches only.
 *
 * An automatic top-up runs every 6 hours from OfflineBootstrap.
 *
 * WARM-RAN-01: the Cancel button reflects the REAL warming state,
 * subscribed from lib/warmingProgress, not only the local `busy` flag
 * — so a background warming pass started by the timer or mount is
 * cancellable too. The Start button shows live progress (N/M) and
 * refuses to lie: if the pipeline is already running it says so
 * instead of toasting success. Clear loops inside resume/reset check
 * the cancel flag between routes. Mode selection is locked during
 * warming.
 */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Wifi, WifiOff, Trash2, Info, Loader2,
  Play, Square, RotateCcw, ListChecks,
} from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { cn } from '@/lib/utils';
import { OfflineFreshnessBadge } from '@/components/offline/OfflineFreshnessBadge';
import {
  getWarmingMode, setWarmingMode,
  WARMING_MODE_LABELS, WARMING_MODE_DESCRIPTIONS, WARMING_MODE_BYTES_EST,
  type WarmingMode,
} from '@/lib/warmingPreferences';
import { readSnapshot, clearSnapshot } from '@/lib/offlineWarmingState';
import {
  requestWarmingCancel, resetWarmingCancel, isWarmingCancelled,
  getKnownRoutes, clearSingleRouteCache,
} from '@/lib/offlineRouteShells';
import { runWarmingPipeline } from '@/lib/offlineWarmingPipeline';
import {
  subscribeWarmingProgress,
  type AggregatedProgress,
} from '@/lib/warmingProgress';
import { OfflineRoutesList } from './OfflineRoutesList';

const MODES: WarmingMode[] = ['fast', 'full', 'off'];

interface Snapshot {
  publicComplete: number;
  personalComplete: number;
  lastWarmedAt: number;
  liveUrlsCount: number;
}

interface StorageInfo { usage: number; quota: number; }

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
  const [mode, setMode] = useState<WarmingMode>('fast');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [progress, setProgress] = useState<AggregatedProgress | null>(null);

  // WARM-RAN-01: subscribe to the aggregate warming state so a
  // background pass (6h timer, mount bootstrap, online event) makes
  // the Cancel button live and the Start button show progress.
  useEffect(() => {
    return subscribeWarmingProgress(setProgress);
  }, []);

  const warmingActive = progress?.active === true;
  // Any operation running here OR any background warming pass.
  const anyRunning =
    warmingActive ||
    busy === 'start' ||
    busy === 'resume' ||
    busy === 'reset';

  const readSnapshotLive = useCallback(async () => {
    try {
      const s = await readSnapshot();
      if (!s) {
        setSnapshot({ publicComplete: 0, personalComplete: 0, lastWarmedAt: 0, liveUrlsCount: 0 });
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
        personalComplete,
        lastWarmedAt,
        liveUrlsCount: s.liveUrls.length,
      });
    } catch { /* IndexedDB unavailable */ }
  }, []);

  const readStorage = useCallback(async () => {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void readSnapshotLive();
    void readStorage();
    setMode(getWarmingMode());
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const id = window.setInterval(() => {
      void readSnapshotLive();
      void readStorage();
    }, 5_000);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [readSnapshotLive, readStorage]);

  // Refresh the snapshot the moment warming flips from active → idle,
  // so the counters reflect the just-finished pass immediately instead
  // of waiting up to 5s for the interval.
  useEffect(() => {
    if (!warmingActive) {
      void readSnapshotLive();
      void readStorage();
    }
  }, [warmingActive, readSnapshotLive, readStorage]);

  function handleModeChange(next: WarmingMode) {
    if (warmingActive) {
      toast.info('لا يمكن تغيير الوضع أثناء التسخين');
      return;
    }
    setMode(next);
    setWarmingMode(next);
    toast.success('تم الحفظ: ' + WARMING_MODE_LABELS[next]);
  }

  // FIX WARM-MANUAL-01: كان الزر يطلق shells + personal + userData بالتوازي
  // (أقفال منفصلة تتنافس على نفس الباندويث) ولا يمس الحزمة الأساسية أبدًا
  // (قوائم الإعلانات/المنتجات كانت تبقى قديمة رغم الضغط على "ابدأ التسخين"),
  // وuserData بلا force. الآن يمر عبر نفس الـ pipeline المتسلسل مع force.
  // يرجع false لو كان تسخين آخر يعمل (لا نعلن "انتهى" زورًا — WARM-RAN-01).
  async function runWarmingPipelineLocal(): Promise<boolean> {
    resetWarmingCancel();
    const { ran } = await runWarmingPipeline({
      authenticated: true,
      force: true,
      skipQueueWait: true,
    });
    return ran;
  }

  async function handleStartNow() {
    if (mode === 'off') {
      toast.error('اختر «سريع» أو «كامل» أولاً');
      return;
    }
    if (warmingActive) {
      toast.info('التسخين يعمل بالفعل في الخلفية');
      return;
    }
    setBusy('start');
    try {
      const ran = await runWarmingPipelineLocal();
      await readSnapshotLive();
      await readStorage();
      if (isWarmingCancelled()) {
        toast.info('أُلغي التسخين');
      } else if (!ran) {
        toast.info('التسخين يعمل بالفعل في الخلفية — حاول بعد قليل');
      } else {
        toast.success('انتهى التسخين');
      }
    } catch (err) {
      console.warn('[offline] warming failed:', err);
      toast.error('فشل التسخين');
    } finally {
      resetWarmingCancel();
      setBusy(null);
    }
  }

  function handleCancel() {
    requestWarmingCancel();
    toast.info('سيُوقف عند اكتمال الصفحة الحالية');
  }

  async function handleResumeRemaining() {
    setBusy('resume');
    try {
      const snap = await readSnapshot();
      const routes = getKnownRoutes();
      let cleared = 0;
      for (const { route, personal } of routes) {
        if (isWarmingCancelled()) break;
        const key = personal ? 'personal:' + route : route;
        const status = snap?.routes?.[key]?.status;
        if (status !== 'complete') {
          await clearSingleRouteCache(route, personal);
          cleared += 1;
        }
      }
      if (!isWarmingCancelled()) {
        await runWarmingPipelineLocal();
      }
      await readSnapshotLive();
      if (isWarmingCancelled()) {
        toast.info('أُلغي الاستئناف بعد مسح ' + cleared + ' صفحة');
      } else {
        toast.success('استؤنف — ' + cleared + ' صفحة ناقصة');
      }
    } catch (err) {
      console.warn('[offline] resume failed:', err);
      toast.error('فشل الاستئناف');
    } finally {
      resetWarmingCancel();
      setBusy(null);
    }
  }

  function handleFullReset() {
    setConfirmResetOpen(true);
  }

  async function performFullReset() {
    setBusy('reset');
    try {
      const routes = getKnownRoutes();
      for (const { route, personal } of routes) {
        if (isWarmingCancelled()) break;
        await clearSingleRouteCache(route, personal);
      }
      if (!isWarmingCancelled()) {
        await runWarmingPipelineLocal();
      }
      await readSnapshotLive();
      await readStorage();
      if (isWarmingCancelled()) {
        toast.info('أُلغي إعادة التحميل');
      } else {
        toast.success('أُعيد التحميل من الصفر');
      }
    } catch (err) {
      console.warn('[offline] full reset failed:', err);
      toast.error('فشل إعادة التحميل');
    } finally {
      resetWarmingCancel();
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
        if (
          n.startsWith('market-static-') ||
          n.startsWith('market-personal-shell-') ||
          n.startsWith('market-core-') ||
          n.startsWith('market-warming-staging')
        ) {
          if (await caches.delete(n)) cleared += 1;
        }
      }
      // CLEAR-WARMING-SNAPSHOT-01: the button's own label promises
      // 'clear all warming' — but only the Cache Storage entries were
      // deleted. The IndexedDB snapshot that every counter on this
      // page reads from stayed intact, so the UI still showed 54/54
      // complete immediately after the wipe. From the user's side the
      // button looked like a no-op.
      await clearSnapshot();
      // Same reasoning for the throttle markers: without this, the
      // next warming pass reads 'warmed N minutes ago' from before the
      // wipe and (on a non-force pass) would skip straight back to
      // 0/54 with no work done.
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const keys: string[] = [];
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const k = window.localStorage.key(i);
            if (k) keys.push(k);
          }
          for (const k of keys) {
            if (
              k.startsWith('marketplat:route-shells:last-warmed') ||
              k.startsWith('marketplat:personal-shells:last-warmed') ||
              k.startsWith('marketplat:core-bundle:last-warmed') ||
              k.startsWith('marketplat:drip-last-pass')
            ) {
              window.localStorage.removeItem(k);
            }
          }
        }
      } catch { /* private mode — harmless */ }
      toast.success('حُذف ' + cleared + ' كاش + snapshot');
      await readSnapshotLive();
      await readStorage();
    } catch (err) {
      console.warn('[offline] clear warming failed:', err);
      toast.error('فشل مسح الكاش');
    } finally {
      setBusy(null);
    }
  }

  const pct = storage && storage.quota > 0
    ? Math.round((storage.usage / storage.quota) * 100)
    : 0;

  const anyBusy = busy !== null;

  // Progress label for the Start button while a pass runs.
  const startLabel = warmingActive && progress && progress.total > 0
    ? 'جاري التسخين… ' + progress.completed + ' / ' + progress.total
    : 'ابدأ التسخين الآن';

  return (
    <div className="space-y-5">
      <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:text-amber-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden />
        <p>
          على شبكة ضعيفة، انتقل إلى{' '}
          <Link href="/offline" className="underline font-medium">صفحة العمل بدون إنترنت</Link>{' '}
          لتصفح المحتوى المُسخَّن مسبقاً.
        </p>
      </div>

      <div className={cn(
        'flex items-center gap-3 rounded-xl border p-3 text-sm',
        online ? 'border-emerald-300/40 bg-emerald-50 text-emerald-800'
               : 'border-amber-300/40 bg-amber-50 text-amber-800',
      )}>
        {online ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
        <span>{online ? 'متصل' : 'غير متصل — التسخين لن يبدأ الآن'}</span>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">وضع التسخين</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            اختر المستوى ثم اضغط «ابدأ التسخين».
          </p>
        </div>
        <div className="divide-y">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              disabled={warmingActive}
              aria-disabled={warmingActive}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-start transition-colors',
                mode === m
                  ? 'border-primary/40 bg-primary/5 shadow-xs'
                  : 'border-transparent hover:bg-muted/50',
                warmingActive && 'opacity-60',
              )}
            >
              <span className={cn(
                'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                mode === m ? 'border-primary' : 'border-muted-foreground/40',
              )}>
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

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2.5">
          <h2 className="text-sm font-semibold">تحكم</h2>
        </div>
        <div className="space-y-2 p-4">
          <Button
            type="button"
            className="w-full justify-start gap-2"
            onClick={handleStartNow}
            disabled={anyBusy || !online || mode === 'off' || warmingActive}
          >
            {(busy === 'start' || warmingActive)
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Play className="h-4 w-4" />}
            {startLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleCancel}
            disabled={!anyRunning}
          >
            <Square className="h-4 w-4" />
            ألغِ التسخين الجاري
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleResumeRemaining}
            disabled={anyBusy || !online || warmingActive}
          >
            {busy === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            أكمل الناقص والفاشلة
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleFullReset}
            disabled={anyBusy || !online || warmingActive}
          >
            {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            أعد التحميل من الصفر
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleClearWarming}
            disabled={anyBusy || warmingActive}
          >
            {busy === 'clear' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            امسح كل التسخين
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">الحالة</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">صفحات عامة مُكتملة</p>
            <p className="mt-0.5 font-mono font-semibold">{snapshot ? snapshot.publicComplete : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">صفحات شخصية مُكتملة</p>
            <p className="mt-0.5 font-mono font-semibold">{snapshot ? snapshot.personalComplete : '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">آخر تسخين</p>
            <p className="mt-0.5 font-mono text-xs">{snapshot ? formatAge(snapshot.lastWarmedAt) : '—'}</p>
            {snapshot?.lastWarmedAt ? (
              <OfflineFreshnessBadge
                className="mt-1"
                savedAt={new Date(snapshot.lastWarmedAt).toISOString()}
                kind="list"
                hideWhenFresh={false}
              />
            ) : null}
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

      <OfflineRoutesList />

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="مسح كل التسخين؟"
        description="سيُمسح كل الكاش المُسخَّن. لن تُمس التنزيلات اليدوية ولا الإعلانات المحفوظة."
        confirmLabel="امسح"
        destructive
        isPending={busy === 'clear'}
        onConfirm={() => {
          setConfirmClearOpen(false);
          void performClearWarming();
        }}
      />

      <ConfirmDialog
        open={confirmResetOpen}
        onOpenChange={setConfirmResetOpen}
        title="أعد التحميل من الصفر؟"
        description="سيُحذف كل الكاش المُسخَّن ويُعاد بناؤه. قد يستهلك بيانات بحسب الوضع المختار."
        confirmLabel="أعد التحميل"
        destructive
        isPending={busy === 'reset'}
        onConfirm={() => {
          setConfirmResetOpen(false);
          void performFullReset();
        }}
      />
    </div>
  );
}
