/**
 * شريط مؤقت يعرض تقدّم تجهيز "الحزمة الأساسية بدون نت" (warmCoreBundle،
 * انظر lib/offlineCoreBundle.ts) — يظهر فقط أثناء التحميل، ويختفي تلقائيًا
 * فور اكتماله (لا حاجة لأي إجراء من المستخدم).
 *
 * - مؤقت وقابل للإغلاق بزر ✕ من الطرف، بنفس نمط UpdatePrompt.tsx.
 * - الإغلاق يُخفي الشريط فقط — التحميل نفسه (warmCoreBundle) لا علاقة له
 *   بهذا المكوّن إطلاقًا ويستمر بالخلفية بشكل طبيعي بغض النظر عن ظهور/إخفاء
 *   الشريط (انظر onWarmupProgress's pub-sub في offlineCoreBundle.ts — مجرد
 *   بث حالة للعرض، مو تحكّم بالتنفيذ).
 * - كل دورة تحميل جديدة (كل 6 ساعات أو عند عودة الاتصال) تُعيد إظهار
 *   الشريط من جديد حتى لو أُغلق بدورة سابقة — الإغلاق مؤقت لهذه الدورة
 *   فقط، مو تفضيلًا دائمًا يستحق التخزين.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { DownloadCloud, X } from 'lucide-react';
import { subscribeWarmingProgress, type AggregatedProgress } from '@/lib/warmingProgress';

function WarmingRow({
  label,
  completed,
  total,
}: {
  label: string;
  completed: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-2xs text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-end text-2xs tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}

// SW-WARMUP-INDICATOR-SESSION-01: warming retries every 30 minutes
// while any route is still failing (see PARTIAL_WARM_INTERVAL_MS in
// offlineRouteShells.ts). Without this gate the indicator would pop
// up on every retry, which on a weak network is most of a browsing
// session. We show it once per tab-session — the user sees the initial
// "preparing the app for offline" message, knows it's working, and is
// not pestered by it again until they open a new tab or go to
// /settings/offline for the full picture.
//
// sessionStorage (not localStorage) is the right scope: it resets on
// tab close, so a returning user gets the information once more, and
// per-tab isolation means a second tab doesn't get silently
// suppressed by the first.
const SHOWN_THIS_SESSION_KEY = 'marketplat:warmup-indicator-shown';

export function WarmupIndicator() {
  const [progress, setProgress] = useState<AggregatedProgress>({
    active: false,
    completed: 0,
    total: 0,
    bySource: {
      core: { active: false, completed: 0, total: 0 },
      routes: { active: false, completed: 0, total: 0 },
      personal: { active: false, completed: 0, total: 0 },
      userdata: { active: false, completed: 0, total: 0 },
    },
  });
  const [dismissed, setDismissed] = useState(false);
  // Read once on mount — see SHOWN_THIS_SESSION_KEY's own comment.
  const [suppressed, setSuppressed] = useState(false);

  // FIX WARMUP-SETSTATE: useRef لتتبع active — بدل nested setState
  // داخل updater (anti-pattern في React: updaters يجب أن تكون pure؛
  // StrictMode قد يستدعيها مرتين).
  const prevActiveRef = useRef(false);

  // Read the "already shown this session" flag once, on mount. If set,
  // skip rendering entirely — warming still runs, just silently.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SHOWN_THIS_SESSION_KEY) === '1') {
        setSuppressed(true);
      }
    } catch {
      // sessionStorage unavailable (private mode, quota) — proceed
      // with normal display behaviour.
    }
  }, []);

  // Mark as shown the moment warming actually starts (progress becomes
  // active) — before the user can dismiss. This must run BEFORE the
  // suppression read on a subsequent mount for the sequence to work:
  //   First visit  → flag empty → indicator shows → flag set → future
  //   reloads      → flag '1'    → suppressed    → no bar
  useEffect(() => {
    if (!progress.active) return;
    try {
      if (sessionStorage.getItem(SHOWN_THIS_SESSION_KEY) !== '1') {
        // STORAGE-QUOTA-GUARD-01: sessionStorage can throw in Safari
        // private mode. Worst case: the indicator shows again next tick
        // within the same session — cosmetic, not functional.
        try {
          sessionStorage.setItem(SHOWN_THIS_SESSION_KEY, '1');
        } catch {
          /* private mode — indicator will re-show, harmless */
        }
      }
    } catch {
      // silent — same as above
    }
  }, [progress.active]);

  useEffect(() => {
    return subscribeWarmingProgress((next) => {
      setProgress(next);
      // active يتحوّل من false إلى true فقط عند بداية دورة جديدة —
      // هذا التوقيت بالذات هو ما يعيد ضبط dismissed.
      if (next.active && !prevActiveRef.current) {
        setDismissed(false);
      }
      prevActiveRef.current = next.active;
    });
  }, []);

  // يختفي تلقائيًا عند الاكتمال (active:false يُبعث دائمًا من warmCoreBundle
  // في finally، نجاحًا كان أو فشلًا جزئيًا) — بدون أي إجراء من المستخدم.
  const anyActive =
    progress.bySource.core.active ||
    progress.bySource.routes.active ||
    progress.bySource.personal.active ||
    progress.bySource.userdata.active;

  if (!progress.active || !anyActive || dismissed || suppressed) return null;

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      // FIX STACK-01: UpdatePrompt.tsx يشغل نفس fixed top-4 — تحديث تطبيق
      // نادر مقابل تجهيز كاش روتيني كل بضع ساعات، فلو ظهرا معًا (كلاهما
      // يُركَّب دائمًا معًا في AppProviders — UpdatePrompt عبر PwaBootstrap
      // وهذا المكوّن عبر OfflineBootstrap، انظر PLAN-runtime-separation
      // مرحلة 2/6) سيتراكبان حرفيًا فوق بعض. إزاحة هذا
      // الشريط لأسفل (top-20 بدل top-4) تكفي لتفادي التراكب بأبسط حل ممكن
      // بدون تنسيق حالة مشتركة بين مكوّنين مستقلّين لسيناريو نادر أصلًا.
      className="fixed inset-x-4 top-20 z-50 flex items-center gap-3 rounded-xl border bg-card p-3 shadow-lg sm:inset-x-auto sm:start-1/2 sm:max-w-sm sm:-translate-x-1/2"
    >
      <DownloadCloud className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">جارٍ تجهيز التصفح بدون إنترنت…</p>
        <div className="mt-2 space-y-1.5">
          {progress.bySource.core.active && (
            <WarmingRow
              label="بيانات"
              completed={progress.bySource.core.completed}
              total={progress.bySource.core.total}
            />
          )}
          {progress.bySource.routes.active && (
            <WarmingRow
              label="صفحات"
              completed={progress.bySource.routes.completed}
              total={progress.bySource.routes.total}
            />
          )}
          {progress.bySource.personal.active && (
            <WarmingRow
              label="حسابي"
              completed={progress.bySource.personal.completed}
              total={progress.bySource.personal.total}
            />
          )}
          {progress.bySource.userdata.active && (
            <WarmingRow
              label="بياناتي"
              completed={progress.bySource.userdata.completed}
              total={progress.bySource.userdata.total}
            />
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="إخفاء — يستمر التحميل بالخلفية"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
