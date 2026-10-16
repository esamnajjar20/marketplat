'use client';

import { useEffect, useRef, useState } from 'react';

export interface DelayedLoadingOptions {
  /** لا تُظهر المؤشر إلا إذا استمر التحميل أكثر من هذه المدة (ms). يمنع الوميض في الطلبات السريعة. */
  delay?: number;
  /** إن ظهر المؤشر، أبقِه هذه المدة على الأقل (ms). يمنع الإخفاء الفوري بعد الظهور. */
  minDuration?: number;
}

/**
 * يحوّل حالة تحميل خام (isLoading / isPending) إلى حالة «اعرض المؤشر الآن؟».
 * - تحميل أقصر من `delay` ⇒ لا يظهر شيء أبداً.
 * - إذا ظهر ⇒ يبقى `minDuration` على الأقل.
 */
export function useDelayedLoading(
  isLoading: boolean,
  { delay = 200, minDuration = 500 }: DelayedLoadingOptions = {},
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (isLoading && !visible) {
      timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
    } else if (!isLoading && visible) {
      const remaining = Math.max(0, minDuration - (Date.now() - shownAt.current));
      timer = setTimeout(() => setVisible(false), remaining);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isLoading, visible, delay, minDuration]);

  return visible;
}
