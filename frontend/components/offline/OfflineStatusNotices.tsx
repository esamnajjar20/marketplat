'use client';

/**
 * إشعارات صغيرة من الـ Service Worker (لا تظهر إلا عند وجود ما يستحق):
 *
 * 1) «بيانات قديمة»: عُرضت لقطة API منتهية الصلاحية بدل صفحة فاضية (فترة السماح في
 *    sw.js: STALE_API_GRACE_MS). عند عودة الاتصال نعيد جلب الاستعلامات النشطة كي لا
 *    تبقى البيانات القديمة معروضة على أنها حديثة.
 * 2) «محفوظ للأوفلاين»: حفظ الصفحة الحالية تعثّر (شبكة ضعيفة) ثم نجح/فشل نهائيًا.
 *    الزيارات العادية الناجحة لا تُظهر شيئًا.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, X } from 'lucide-react';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { formatOfflineSavedAt } from '@/lib/offlineFreshness';
import { subscribeSwUiNotices, type ShellCacheStatus } from '@/lib/offlineShellStatus';

const SAVED_NOTICE_MS = 3500;

const CHIP_BASE = cn(
  'fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom,0px))] start-3 z-[60] flex max-w-[calc(100vw-1.5rem)] items-center gap-1.5 rounded-full',
  'px-3 py-1.5 text-xs font-medium shadow-lg sm:bottom-16',
);

export function OfflineStatusNotices() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [staleSavedAt, setStaleSavedAt] = useState<number | null>(null);
  const [shell, setShell] = useState<{ pathname: string; status: ShellCacheStatus } | null>(null);

  useEffect(() => {
    return subscribeSwUiNotices((notice) => {
      if (notice.type === 'STALE_API_SERVED') {
        setStaleSavedAt((prev) => (prev == null ? notice.cachedAt : Math.min(prev, notice.cachedAt)));
      } else {
        setShell({ pathname: notice.pathname, status: notice.status });
      }
    });
  }, []);

  // عاد الاتصال: أعد جلب الاستعلامات النشطة ثم أخفِ تنبيه البيانات القديمة.
  useEffect(() => {
    if (!isOnline || staleSavedAt == null) return;
    void queryClient.invalidateQueries();
    setStaleSavedAt(null);
  }, [isOnline, staleSavedAt, queryClient]);

  // 'saved' عابر.
  useEffect(() => {
    if (shell?.status !== 'saved') return;
    const id = window.setTimeout(() => setShell(null), SAVED_NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [shell]);

  const shellForThisPage = shell && shell.pathname === pathname ? shell : null;

  return (
    <>
      {staleSavedAt != null && !isOnline && (
        <div role="status" aria-atomic="true" className={cn(CHIP_BASE, 'bg-warning text-warning-foreground')}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            بيانات قديمة · {formatOfflineSavedAt(new Date(staleSavedAt).toISOString())}
          </span>
          <button
            type="button"
            onClick={() => setStaleSavedAt(null)}
            aria-label="إغلاق"
            className="ms-1 shrink-0 rounded-full p-0.5 opacity-80 hover:opacity-100"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}

      {shellForThisPage && (
        <div
          role="status"
          aria-atomic="true"
          className={cn(
            CHIP_BASE,
            staleSavedAt != null && !isOnline && 'bottom-[calc(10.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-28',
            shellForThisPage.status === 'saved' && 'bg-success text-success-foreground',
            shellForThisPage.status === 'pending' && 'bg-muted text-foreground',
            shellForThisPage.status === 'failed' && 'bg-warning text-warning-foreground',
          )}
        >
          {shellForThisPage.status === 'saved' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          {shellForThisPage.status === 'pending' && <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          {shellForThisPage.status === 'failed' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span className="truncate">
            {shellForThisPage.status === 'saved' && 'تم حفظ هذه الصفحة للأوفلاين'}
            {shellForThisPage.status === 'pending' && 'جارٍ إكمال حفظ هذه الصفحة للأوفلاين…'}
            {shellForThisPage.status === 'failed' && 'تعذّر حفظ هذه الصفحة للأوفلاين'}
          </span>
          {shellForThisPage.status !== 'saved' && (
            <button
              type="button"
              onClick={() => setShell(null)}
              aria-label="إغلاق"
              className="ms-1 shrink-0 rounded-full p-0.5 opacity-80 hover:opacity-100"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
      )}
    </>
  );
}
