'use client';

/**
 * زر/شريط تثبيت التطبيق (Add to Home Screen).
 *
 * Android/Chrome/Edge: نعترض حدث `beforeinstallprompt` (المتصفح لا يعرضه
 * تلقائيًا إلا إذا استدعينا prompt() بأنفسنا) ونعرض شريطًا مخصصًا بدل
 * الاعتماد على شريط المتصفح الافتراضي، مع تأجيل الظهور حتى يتفاعل
 * المستخدم قليلًا مع الموقع (لا نزعجه من أول ثانية).
 *
 * iOS Safari لا يطلق `beforeinstallprompt` إطلاقًا (قيد من Apple) — نعرض
 * بدلاً منه إرشادات نصية لخطوات "مشاركة ← إضافة إلى الشاشة الرئيسية".
 */

import { useEffect, useState } from 'react';
import { X, Share, PlusSquare, Download } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_STORAGE_KEY = 'pwa-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // أسبوع قبل إعادة الاقتراح

function isIos(): boolean {
  // FIX INSTALL-IOS-SSR: حماية defensive (يُستدعى من useEffect، لكن
  // نظيف لو استُدعي في سياق آخر مستقبلًا).
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}


export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      // مصدر الحقيقة: lib/runtime/capabilities.supportsInstallPrompt
      // (Native → false، standalone PWA → false، Browser فقط → true).
      const { supportsInstallPrompt } = await import('@/lib/runtime/capabilities');
      if (!(await supportsInstallPrompt())) return;
      if (cancelled) return;

      // SW-PWA-STORAGE-READ-GUARD-01: localStorage.getItem can throw
      // in Safari Private Browsing and on quota exhaustion. handleDismiss
      // below already wraps its setItem in try/catch; the read was
      // inconsistent. A throw here aborts the whole prompt bootstrap.
      let dismissedAt = 0;
      try {
        dismissedAt = Number(localStorage.getItem(DISMISS_STORAGE_KEY) ?? 0);
      } catch {
        dismissedAt = 0;
      }
      const withinCooldown = Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
      if (withinCooldown) return;

      setDismissed(false);

      const handleBeforeInstall = (event: Event) => {
        event.preventDefault();
        setDeferredPrompt(event as BeforeInstallPromptEvent);
      };
      window.addEventListener('beforeinstallprompt', handleBeforeInstall);

      if (isIos()) {
        setShowIosHint(true);
      }

      cleanup = () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    })().catch((err) => {
      // UNHANDLED-CATCH-FIX
      console.warn('[install-prompt] bootstrap failed:', err);
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const handleDismiss = () => {
    // FIX INSTALL-DISMISS-QUOTA: localStorage قد يرمي في private mode أو
    // عند quota exceeded — الزر يجب أن يُغلق على أي حال.
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch (err) {
      console.warn('[install-prompt] dismiss persist failed:', err);
    }
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    // FIX INSTALL-PROMPT-CATCH: prompt() قد يرمي (حالة متصفح غير متوقعة
    // أو رفض المستخدم) — بدون catch، الزر يبقى مع unhandled rejection.
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted' || outcome === 'dismissed') {
        setDeferredPrompt(null);
      }
    } catch (err) {
      console.warn('[install-prompt] prompt failed:', err);
    }
    // أغلق على أي حال — التحديث فقط عند نجاح فعلي.
    handleDismiss();
  };

  if (dismissed || (!deferredPrompt && !showIosHint)) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-x-4 bottom-4 z-50 flex items-center gap-3 rounded-xl border bg-card p-4 shadow-lg sm:inset-x-auto sm:end-4 sm:max-w-sm"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Download className="h-5 w-5" />
      </span>

      <div className="flex-1 text-sm">
        <p className="font-medium">ثبّت تطبيق سوق غزة</p>
        {deferredPrompt ? (
          <p className="text-muted-foreground">وصول أسرع، ويعمل حتى بدون إنترنت.</p>
        ) : (
          <p className="text-muted-foreground">
            اضغط <Share className="inline h-3.5 w-3.5" /> ثم{' '}
            <PlusSquare className="inline h-3.5 w-3.5" /> «إضافة إلى الشاشة الرئيسية»
          </p>
        )}
      </div>

      {deferredPrompt && (
        <Button size="sm" onClick={handleInstall}>
          تثبيت
        </Button>
      )}

      <button
        onClick={handleDismiss}
        aria-label="إغلاق"
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
