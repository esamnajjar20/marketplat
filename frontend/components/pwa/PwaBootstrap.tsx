/**
 * نقطة الإقلاع لمنطق PWA الأساسي — تُركَّب مرة واحدة في AppProviders.
 * تسجّل الـ Service Worker وتركّب شريطي التثبيت/التحديث فقط.
 *
 * PLAN-runtime-separation (مرحلة 2/6): منطق الـ Offline (queue replay،
 * ad-draft sync، warming، مزامنة Push) استُخرج إلى OfflineBootstrap.tsx —
 * نفس الكود، نفس السلوك، ملف مختلف. لا تغيير سلوكي بهذه الخطوة، تنظيم
 * تسمية فقط.
 */
'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/pwa';
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
  }, []);

  return (
    <>
      <InstallPrompt />
      <UpdatePrompt />
    </>
  );
}
