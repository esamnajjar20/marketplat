'use client';

import Link from 'next/link';
import { useAdminAds } from '@/hooks/queries/useAdmin';
import { ROUTES }      from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';

export function AdminRecentActivity() {
  const { data, isLoading, isError, refetch } = useAdminAds({ page: 1, limit: 8 });
  const items = data?.items ?? [];

  if (isLoading) return <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>;

  // UX-FIX P1-9 (admin variant): don't render "لا توجد نشاطات" on a
  // failed fetch — an admin could wrongly read that as "the platform
  // is quiet" rather than "this widget couldn't load".
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm rounded-lg border">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل النشاط الأخير</p>
        <button type="button" onClick={() => refetch()} className="text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

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
