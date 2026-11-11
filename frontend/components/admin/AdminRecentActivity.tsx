'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { useAdminAds } from '@/hooks/queries/useAdmin';
import { ROUTES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ApiError } from '@/components/shared/ApiError';
import { parseApiError } from '@/lib/errorParser';
import { adminTabHref } from '@/lib/adminHubTabs';

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'نشط',
  PENDING: 'قيد المراجعة',
  REJECTED: 'مرفوض',
  SOLD: 'مباع',
  EXPIRED: 'منتهي',
};

export function AdminRecentActivity() {
  const { data, isLoading, isError, error, refetch } = useAdminAds({ page: 1, limit: 5 });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-card border border-[var(--legacy-border)] bg-card py-8">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (isError) {
    return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  }

  return (
    <section className="overflow-hidden rounded-card border border-[var(--legacy-border)] bg-card shadow-[0_1px_3px_rgba(42,36,29,0.05)]">
      <div className="flex items-center justify-between px-3.5 py-3">
        <h2 className="text-card-title font-extrabold">أحدث الإعلانات</h2>
        <IntentPrefetchLink
          href={adminTabHref('ads')}
          className="text-xs font-bold text-[var(--legacy-primary-deep)] hover:underline" prefetch={false}
        >
          عرض الكل ←
        </IntentPrefetchLink>
      </div>
      <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr] items-center gap-3 border-b border-[var(--legacy-border)] bg-[var(--legacy-surface)] px-3.5 text-xs font-bold text-[var(--legacy-foreground-warm)] h-10">
        <span>الإعلان</span>
        <span>صاحب الإعلان</span>
        <span>الحالة</span>
        <span>التاريخ</span>
      </div>
      {items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">لا توجد إعلانات حديثة</p>
      )}
      {items.map((ad) => (
        <div
          key={ad.id}
          className="grid grid-cols-[2fr_1.2fr_1fr_1fr] items-center gap-3 border-b border-[var(--legacy-muted-surface)] px-3.5 text-sm-tight h-14 last:border-b-0"
        >
          <IntentPrefetchLink
            prefetch={false}
            href={ROUTES.adDetail(ad.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate font-bold hover:underline"
          >
            {ad.title}
          </IntentPrefetchLink>
          <span className="truncate text-[var(--legacy-foreground-warm)]">{ad.user?.name ?? '—'}</span>
          <span>
            <span className="inline-flex h-[22px] items-center rounded-full bg-[var(--legacy-primary-soft)] px-2 text-2xs-tight font-bold text-[var(--legacy-primary-deep)]">
              {STATUS_LABEL[ad.status] ?? ad.status}
            </span>
          </span>
          <span className="text-xs text-[var(--legacy-muted-text)]">
            <HydrationSafeRelativeTime date={ad.createdAt} />
          </span>
        </div>
      ))}
    </section>
  );
}
