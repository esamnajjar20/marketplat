'use client';

/**
 * SLOW-NET phase4 — visible feedback when list UI is served from cache
 * or is refreshing silently (keepPreviousData / offline list / SW).
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** True while a network refetch is in flight */
  isFetching?: boolean;
  /** True when some list data is already on screen */
  hasData?: boolean;
  /** Optional: true when TanStack reports placeholder/previous data */
  isPlaceholderData?: boolean;
  className?: string;
}

export function ListDataStatus({
  isFetching = false,
  hasData = false,
  isPlaceholderData = false,
  className,
}: Props) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!hasData) return null;

  if (!online) {
    return (
      <p
        role="status"
        className={cn(
          'mb-2 text-center text-xs text-amber-700 dark:text-amber-400',
          className,
        )}
      >
        عرض من الكاش — لا يوجد اتصال حالياً
      </p>
    );
  }

  if (isFetching || isPlaceholderData) {
    return (
      <p
        role="status"
        className={cn(
          'mb-2 animate-pulse text-center text-xs text-muted-foreground',
          className,
        )}
      >
        {isPlaceholderData && !isFetching
          ? 'عرض نتائج سابقة — جاري التحقق…'
          : 'جاري تحديث النتائج…'}
      </p>
    );
  }

  return null;
}
