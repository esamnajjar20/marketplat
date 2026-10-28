'use client';

interface OfflineStaleDataNoticeProps {
  onRetry?: () => void;
  isFetching?: boolean;
}

/**
 * Shown when a previously loaded query still has usable data but its latest
 * refresh failed. Keep the data visible and communicate that freshness is
 * uncertain instead of replacing the page with a blocking error state.
 */
export function OfflineStaleDataNotice({
  onRetry,
  isFetching = false,
}: OfflineStaleDataNoticeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground"
    >
      <span>تعذّر تحديث البيانات؛ تعرض آخر نسخة محفوظة وقد لا تكون الأحدث.</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isFetching}
          aria-busy={isFetching}
          className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
        >
          {isFetching ? 'جارٍ التحديث…' : 'إعادة المحاولة'}
        </button>
      )}
    </div>
  );
}
