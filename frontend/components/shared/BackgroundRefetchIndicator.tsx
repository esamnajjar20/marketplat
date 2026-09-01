'use client';

/**
 * BackgroundRefetchIndicator — شريط رفيع أعلى الشاشة أثناء refetch في الخلفية
 * (stale-while-revalidate) دون إخفاء المحتوى الحالي.
 */

import { useIsFetching } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

export function BackgroundRefetchIndicator() {
  // isFetching يشمل التحميل الأول أيضاً؛ نستثني عبر fetchStatus في الممارسة
  // useIsFetching() > 0 كافٍ كإشارة خفيفة — NavigationProgress يغطي التنقّل.
  const fetching = useIsFetching({
    predicate: (q) => q.state.fetchStatus === 'fetching' && q.state.status === 'success',
  });

  const active = fetching > 0;

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[140] h-0.5 overflow-hidden transition-opacity duration-200',
        active ? 'opacity-100' : 'opacity-0',
      )}
      aria-hidden={!active}
    >
      {active && <div className="nav-progress-bar h-full opacity-70" />}
    </div>
  );
}
