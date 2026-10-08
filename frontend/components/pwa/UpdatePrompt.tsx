'use client';

/**
 * شريط إشعار بوجود نسخة جديدة من التطبيق جاهزة للتفعيل.
 *
 * لا نُحدِّث الـ Service Worker تلقائيًا دون إذن المستخدم — قد يكون في
 * منتصف تعبئة نموذج (إعلان جديد، طلب خدمة...) وإعادة تحميل مفاجئة
 * تفقده عمله. الزر يمنحه التحكم في توقيت التحديث.
 *
 * - مؤقت وقابل للإغلاق بزر ✕ من الطرف.
 * - بعد الإغلاق يُعاد الظهور دوريًا (كل 4 ساعات) طالما التحديث ما زال متاحًا.
 * - يُعرَض أيضًا كإشعار في قسم الإشعارات (NotificationBell + صفحة الإشعارات).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { onServiceWorkerUpdate, activateWaitingServiceWorker } from '@/lib/pwa';

// إعادة تصدير ليستخدمها NotificationBell وصفحة الإشعارات
export { activateWaitingServiceWorker };

const DISMISS_KEY = 'pwa-update-dismissed-at';
/** بعد الإغلاق، أعد إظهار الشريط بعد هذه المدة (مللي ثانية). */
const REAPPEAR_AFTER_MS = 4 * 60 * 60 * 1000; // 4 ساعات

/** حالة مشتركة بين UpdatePrompt وقسم الإشعارات. */
let sharedRegistration: ServiceWorkerRegistration | null = null;
const sharedListeners = new Set<(reg: ServiceWorkerRegistration | null) => void>();

function notifyShared(reg: ServiceWorkerRegistration | null) {
  sharedRegistration = reg;
  sharedListeners.forEach((cb) => cb(reg));
}

/** يستمع مكوّن الإشعارات لهذه الحالة لعرض عنصر "تحديث التطبيق". */
export function onPwaUpdateAvailable(
  listener: (reg: ServiceWorkerRegistration | null) => void,
): () => void {
  sharedListeners.add(listener);
  // أبلغ فورًا بالحالة الحالية
  listener(sharedRegistration);
  return () => {
    sharedListeners.delete(listener);
  };
}

export function getPwaUpdateRegistration(): ServiceWorkerRegistration | null {
  return sharedRegistration;
}

function isDismissedRecently(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < REAPPEAR_AFTER_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore quota / private mode
  }
}

export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [visible, setVisible] = useState(false);

  const showIfAllowed = useCallback((reg: ServiceWorkerRegistration) => {
    // لا تُظهر الشريط إن لم يعد هناك waiting (بعد تفعيل ناجح)
    if (!reg.waiting) {
      setRegistration(null);
      notifyShared(null);
      setVisible(false);
      return;
    }
    setRegistration(reg);
    notifyShared(reg);
    // كتم فوري بعد تفعيل حديث (انظر JUST_UPDATED في lib/pwa.ts)
    try {
      const ts = Number(sessionStorage.getItem('pwa-just-updated-at') || 0);
      if (ts && Date.now() - ts < 5 * 60 * 1000) {
        setVisible(false);
        return;
      }
    } catch {
      /* ignore */
    }
    if (!isDismissedRecently()) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    return onServiceWorkerUpdate((reg) => {
      showIfAllowed(reg);
    });
  }, [showIfAllowed]);

  // إعادة الظهور الدوري: كل دقيقة نفحص إن انتهت فترة الإخفاء والتحديث ما زال waiting
  useEffect(() => {
    if (!registration?.waiting) return;

    const tick = () => {
      if (registration.waiting && !isDismissedRecently()) {
        setVisible(true);
      }
    };

    const id = window.setInterval(tick, 60_000);
    // أيضًا عند عودة التبويب للواجهة
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [registration]);

  const handleDismiss = () => {
    markDismissed();
    setVisible(false);
    // نبقي sharedRegistration حتى يظهر في قسم الإشعارات
  };

  if (!visible || !registration) return null;

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 top-4 z-50 flex items-center gap-2 rounded-xl border bg-card p-3 shadow-lg sm:inset-x-auto sm:start-1/2 sm:max-w-md sm:-translate-x-1/2"
    >
      <RefreshCw className="h-5 w-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm">يتوفر تحديث جديد للتطبيق</p>
      <Button size="sm" asChild>
        <Link href="/update">تحديث الآن</Link>
      </Button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="إخفاء الإشعار"
        className="flex h-[var(--touch-target)] w-[var(--touch-target)] shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

