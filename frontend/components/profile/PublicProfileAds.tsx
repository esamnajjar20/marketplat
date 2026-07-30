'use client';

import { useSearchParams } from 'next/navigation';
import { AdCard }          from '@/components/ads/AdCard';
import { AdCardSkeleton }  from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState }      from '@/components/shared/feedback/EmptyState';
import { Pagination }      from '@/components/shared/ui/Pagination';
import { useUserAds }      from '@/hooks/queries/useAds';
import { ShoppingBag, AlertTriangle } from 'lucide-react';

interface Props { userId: string; }

export function PublicProfileAds({ userId }: Props) {
  const sp   = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const { data, isLoading, isError, refetch } = useUserAds(userId, { page });

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  // UX-FIX P1-9 (public-profile variant): don't tell a visitor "this
  // user hasn't posted any ads" when the real cause is a failed fetch.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل الإعلانات</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState icon={<ShoppingBag className="h-8 w-8" />}
      title="لا توجد إعلانات" description="لم ينشر هذا المستخدم أي إعلانات بعد" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((ad) => <AdCard key={ad.id} ad={ad} />)}
      </div>
      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page} baseUrl={`/profile/${userId}`} />
      )}
    </div>
  );
}
