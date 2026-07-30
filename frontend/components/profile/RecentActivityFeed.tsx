'use client';

import Link from 'next/link';
import { useMyAds }  from '@/hooks/queries/useAds';
import { ROUTES, STATUS_LABELS } from '@/lib/constants';
import { formatRelativeTime, formatPrice } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ShoppingBag, AlertTriangle } from 'lucide-react';

export function RecentActivityFeed() {
  const { data, isLoading, isError, refetch } = useMyAds({ limit: 5 });

  if (isLoading) return <div className="flex justify-center py-6"><LoadingSpinner size="sm" /></div>;

  // UX-FIX P1-9 (dashboard-widget variant): don't tell the user "لا
  // توجد إعلانات حتى الآن" — with a "publish your first ad" prompt, no
  // less — when a seller with real ads simply hit a failed fetch.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل النشاط الأخير</p>
        <button type="button" onClick={() => refetch()} className="text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        لا توجد إعلانات حتى الآن.{' '}
        <Link href={ROUTES.adCreate} className="text-primary hover:underline">انشر أول إعلان</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((ad) => (
        <Link key={ad.id} href={ROUTES.adDetail(ad.id)}
          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{ad.title}</p>
            <p className="text-xs text-muted-foreground">{STATUS_LABELS[ad.status]} · {formatRelativeTime(ad.createdAt)}</p>
          </div>
          <span className="text-sm font-semibold text-primary shrink-0">{formatPrice(ad.price)}</span>
        </Link>
      ))}
      {(data?.meta?.total ?? 0) > 5 && (
        <Link href={ROUTES.myAds} className="block text-center text-sm text-primary hover:underline">
          عرض جميع الإعلانات
        </Link>
      )}
    </div>
  );
}
