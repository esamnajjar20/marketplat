'use client';

import { useSearchParams } from 'next/navigation';
import { Heart } from 'lucide-react';
import { StoreCard } from './StoreCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useMyFollowedStores } from '@/hooks/queries/useStores';
import { ROUTES } from '@/lib/constants';

export function FollowedStoresList() {
  const sp = useSearchParams();
  const page = Number(sp.get('page') ?? 1);

  const { data, isLoading, isError, refetch } = useMyFollowedStores({ page, limit: 12 });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل المتاجر المتابَعة</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-10 w-10" />}
        title="لا تتابع أي متجر بعد"
        description="تابع متاجرك المفضلة لتصلك آخر منتجاتها"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((follow) => (
          <StoreCard key={follow.id} store={follow.store} />
        ))}
      </div>

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.myFollowedStores}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}
    </div>
  );
}
