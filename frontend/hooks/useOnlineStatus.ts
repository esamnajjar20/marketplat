'use client';

import { useEffect, useState } from 'react';

/**
 * حالة الاتصال بالإنترنت — مستخرج من NetworkStatusBanner.tsx وBottomNav.tsx's
 * badge (زر القائمة) ليستخدما نفس المصدر بدل تكرار مستمعي online/offline في
 * كل مكوّن على حدة.
 *
 * يبدأ بـ true دائمًا (حتى بأول رندر على العميل) لتفادي وميض "غير متصل"
 * خاطئ قبل أن يتحقق useEffect فعليًا من navigator.onLine بعد التركيب —
 * الفرق حقيقي فقط لجزء من الميلي ثانية، ولا داعي لقراءة navigator.onLine
 * أثناء الرندر نفسه (غير متاح بالخادم أصلًا، والقيمة الابتدائية بأي حال
 * تُصحَّح فورًا بأول useEffect بعد التركيب).
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}
