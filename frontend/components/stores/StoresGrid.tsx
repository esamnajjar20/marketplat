'use client';

import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { StoreCard } from './StoreCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useStores } from '@/hooks/queries/useStores';
import { ROUTES } from '@/lib/constants';
import type { StoreSortField } from '@/types/store.types';

/** GET /stores directory grid. Mirrors ServiceListingsGrid's layout/behaviour. */
export function StoresGrid() {
  const sp = useSearchParams();

  const search = sp.get('search') ?? undefined;
  const page = Number(sp.get('page') ?? 1);
  const city = sp.get('city') ?? undefined;
  const sortBy = (sp.get('sortBy') as StoreSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

  const { data, isLoading, isError, refetch } = useStores({
    search, page, city, sortBy, sortOrder,
  });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;
  const searchParams = Object.fromEntries(sp.entries());

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل المتاجر</p>
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

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total > 0 ? `${total} متجر` : 'لا توجد نتائج'}
        {search && <> بحثاً عن «<span className="font-medium text-foreground">{search}</span>»</>}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد متاجر"
          description={search ? `لم نجد نتائج لـ "${search}"` : 'لا توجد متاجر مطابقة لهذه الفلاتر'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.stores}
          searchParams={searchParams}
        />
      )}
    </div>
  );
}
