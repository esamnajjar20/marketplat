'use client';

/**
 * مركز الأوفلاين — نقطة العمل المحلية عند انقطاع الاتصال أو عند فتحه يدويًا.
 *
 * لا نعيد توجيه المستخدم تلقائيًا عند عودة الاتصال؛ يمكنه متابعة ما جاء
 * من أجله ثم الرجوع بنفسه. كل حالات الطابور والمزامنة تظهر داخل تبويب
 * «المزامنة» بدل تكرارها فوق المركز.
 */

import { useEffect, useState } from 'react';
import { OfflineHub } from '@/components/offline/OfflineHub';
import { resolveOfflineTab, type OfflineTab } from '@/lib/offlineHubTabs';

export default function OfflinePage() {
  const [initialTab, setInitialTab] = useState<OfflineTab | null>(null);

  useEffect(() => {
    setInitialTab(resolveOfflineTab(window.location.search, window.location.pathname));
  }, []);

  return (
    <main className="mx-auto min-h-screen min-h-dvh w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="w-full rounded-3xl border border-border/70 bg-card/40 p-3 shadow-sm sm:p-5 lg:p-6">
        <OfflineHub initialTab={initialTab} />
      </div>
    </main>
  );
}
