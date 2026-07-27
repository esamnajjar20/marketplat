/**
 * شريط إشعار بوجود نسخة جديدة من التطبيق جاهزة للتفعيل.
 *
 * لا نُحدِّث الـ Service Worker تلقائيًا دون إذن المستخدم — قد يكون في
 * منتصف تعبئة نموذج (إعلان جديد، طلب خدمة...) وإعادة تحميل مفاجئة
 * تفقده عمله. الزر يمنحه التحكم في توقيت التحديث.
 */
'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { onServiceWorkerUpdate, activateWaitingServiceWorker } from '@/lib/pwa';

export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    return onServiceWorkerUpdate((reg) => setRegistration(reg));
  }, []);

  if (!registration) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-x-4 top-4 z-50 flex items-center gap-3 rounded-xl border bg-card p-3 shadow-lg sm:inset-x-auto sm:start-1/2 sm:max-w-md sm:-translate-x-1/2"
    >
      <RefreshCw className="h-5 w-5 shrink-0 text-primary" />
      <p className="flex-1 text-sm">يتوفر تحديث جديد للتطبيق</p>
      <Button size="sm" onClick={() => activateWaitingServiceWorker(registration)}>
        تحديث الآن
      </Button>
    </div>
  );
}
