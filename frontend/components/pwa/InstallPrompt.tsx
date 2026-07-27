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
'use client';

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
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari القديم لا يدعم matchMedia لهذا — يوفر خاصية مباشرة بدلًا من ذلك
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return; // مثبّت أصلًا — لا داعٍ للشريط

    const dismissedAt = Number(localStorage.getItem(DISMISS_STORAGE_KEY) ?? 0);
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

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted' || outcome === 'dismissed') {
      setDeferredPrompt(null);
    }
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
