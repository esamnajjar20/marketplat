/**
 * نقطة الإقلاع الوحيدة لكل منطق PWA — تُركَّب مرة واحدة في AppProviders.
 * تسجّل الـ Service Worker وتركّب شريطي التثبيت/التحديث.
 */
'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwa';
import { requestQueueReplay } from '@/lib/offlineQueue';
import { InstallPrompt } from './InstallPrompt';
import { UpdatePrompt } from './UpdatePrompt';

export function PwaBootstrap() {
  // ⚠️ يعتمد على ترتيب تنفيذ useEffect في React: التأثيرات (effects) تُنفَّذ
  // من الأسفل إلى الأعلى في الشجرة — أي أن useEffect داخل <UpdatePrompt/>
  // (الذي يستدعي onServiceWorkerUpdate في lib/pwa.ts ليُسجِّل مستمعًا)
  // ينفَّذ قبل useEffect هنا الذي يستدعي registerServiceWorker(). هذا
  // ضروري: لو استدعينا registerServiceWorker() أولًا وكان هناك SW بحالة
  // "waiting" فورًا، فسيُطلَق الإشعار قبل وجود أي مستمع مسجَّل ويُفقد
  // الحدث بصمت. لا تُعِد ترتيب <UpdatePrompt/> ليصبح خارج هذا المكوّن أو
  // قبل تركيبه دون مراعاة هذا الترتيب.
  useEffect(() => {
    void registerServiceWorker();

    // fallback لإعادة إرسال الطابور عند عودة الاتصال في المتصفحات التي لا
    // تدعم Background Sync (انظر تعليق requestQueueReplay).
    const handleOnline = () => void requestQueueReplay();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return (
    <>
      <InstallPrompt />
      <UpdatePrompt />
    </>
  );
}
