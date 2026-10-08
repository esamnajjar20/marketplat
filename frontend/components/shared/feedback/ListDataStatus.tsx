'use client';

/**
 * SLOW-NET — visible feedback when list UI is from cache or refreshing.
 * design tokens instead of hardcoded amber classes.
 */
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

interface Props {
  isFetching?: boolean;
  hasData?: boolean;
  isPlaceholderData?: boolean;
  className?: string;
}

export function ListDataStatus({
  isFetching = false,
  hasData = false,
  isPlaceholderData = false,
  className,
}: Props) {
  const online = useOnlineStatus();

  if (!hasData) return null;

  if (!online) {
    return (
      <p
        role="status"
        aria-atomic="true"
        className={cn(
          'mb-2 rounded-lg bg-warning-soft px-3 py-1.5 text-center text-2xs font-medium text-warning-foreground sm:text-xs',
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
        aria-atomic="true"
        className={cn(
          'mb-2 animate-pulse text-center text-2xs text-muted-foreground sm:text-xs',
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
