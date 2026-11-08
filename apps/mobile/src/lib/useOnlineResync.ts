import { useEffect, useRef } from 'react';
import { useIsOnline } from '@/lib/connectivity';

/**
 * يعيد استدعاء onReconnect عند الانتقال الحقيقي من offline إلى online فقط.
 * لا يعيد الاشتراك عند تغيّر دوال التحميل (يستخدم refs).
 */
export function useOnlineResync(onReconnect: () => void) {
  const isOnline = useIsOnline();
  const previousOnline = useRef<boolean | null>(isOnline);
  const cbRef = useRef(onReconnect);

  useEffect(() => { cbRef.current = onReconnect; }, [onReconnect]);

  useEffect(() => {
    const wasOnline = previousOnline.current;
    previousOnline.current = isOnline;
    if (wasOnline === false && isOnline) cbRef.current();
  }, [isOnline]);
}
