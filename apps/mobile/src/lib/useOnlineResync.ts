import { useEffect, useRef } from 'react';
import { useIsOnline } from '@/lib/connectivity';
import { runWhenScrollIdle } from '@/lib/scrollActivity';

type OnlineResyncOptions = {
  /**
   * true: إن عاد الاتصال أثناء تمرير المستخدم لقائمة، يُؤجَّل الاستدعاء حتى يهدأ التمرير
   * (حدّ أقصى ~1.5s) كي لا تحدث setState/قراءة SQLite أثناء الزخم.
   * للمستهلكين الذين يحدّثون واجهة قوائم فقط؛ لا تستعمله للمصادقة أو الإشعارات.
   */
  deferWhileScrolling?: boolean;
};

/**
 * يعيد استدعاء onReconnect عند الانتقال الحقيقي من offline إلى online فقط.
 * لا يعيد الاشتراك عند تغيّر دوال التحميل (يستخدم refs).
 */
export function useOnlineResync(onReconnect: () => void, options: OnlineResyncOptions = {}) {
  const { deferWhileScrolling = false } = options;
  const isOnline = useIsOnline();
  const previousOnline = useRef<boolean | null>(isOnline);
  const cbRef = useRef(onReconnect);

  useEffect(() => { cbRef.current = onReconnect; }, [onReconnect]);

  useEffect(() => {
    const wasOnline = previousOnline.current;
    previousOnline.current = isOnline;
    if (wasOnline !== false || !isOnline) return;
    if (!deferWhileScrolling) {
      cbRef.current();
      return;
    }
    // الإلغاء عند فكّ التركيب أو عند تغيّر حالة الاتصال قبل أن يهدأ التمرير.
    return runWhenScrollIdle(() => cbRef.current());
  }, [isOnline, deferWhileScrolling]);
}
