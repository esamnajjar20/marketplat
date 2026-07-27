'use client';

import Link from 'next/link';
import { useAdminAds } from '@/hooks/queries/useAdmin';
import { ROUTES }      from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export function AdminRecentActivity() {
  const { data, isLoading } = useAdminAds({ page: 1, limit: 8 });
  const items = data?.items ?? [];

  if (isLoading) return <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>;

  return (
    <div className="divide-y rounded-lg border overflow-hidden">
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد نشاطات</p>
      )}
      {items.map((ad) => (
        <div key={ad.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
          <div className="min-w-0">
            <Link href={ROUTES.adDetail(ad.id)} target="_blank"
              className="text-sm font-medium hover:underline line-clamp-1">{ad.title}</Link>
            <p className="text-xs text-muted-foreground">{ad.user?.name ?? '—'}</p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 ms-3">{formatRelativeTime(ad.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}
