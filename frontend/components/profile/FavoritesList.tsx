'use client';

import Link from 'next/link';
import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState }    from '@/components/shared/feedback/EmptyState';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { useFavorites }  from '@/hooks/queries/useFavorites';
import { useSearchParams } from 'next/navigation';
import { Heart }         from 'lucide-react';
import { Button }        from '@/components/shared/ui/Button';
import { ROUTES }        from '@/lib/constants';

export function FavoritesList() {
  const sp   = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const { data, isLoading } = useFavorites({ page });

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={<Heart className="h-10 w-10" />}
        title="لا توجد إعلانات محفوظة"
        description="احفظ الإعلانات التي تعجبك لتجدها هنا لاحقاً"
        action={<Link href={ROUTES.home}><Button variant="outline">تصفح الإعلانات</Button></Link>} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((fav) => (
          <AdCard key={fav.ad.id} ad={fav.ad} />
        ))}
      </div>
      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page} baseUrl="/favorites" />
      )}
    </div>
  );
}
