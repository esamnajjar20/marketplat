'use client';

import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { ServiceListingCard } from './ServiceListingCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { ROUTES } from '@/lib/constants';
import type { ServiceListingSortField } from '@/types/service.types';

export function ServiceListingsGrid() {
  const sp = useSearchParams();

  const search = sp.get('search') ?? undefined;
  const page = Number(sp.get('page') ?? 1);
  const categoryId = sp.get('categoryId') ?? undefined;
  const city = sp.get('city') ?? undefined;
  const serviceLocation = (sp.get('serviceLocation') as 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE' | undefined) ?? undefined;
  const minPrice = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  const sortBy = (sp.get('sortBy') as ServiceListingSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

  const { data, isLoading, isError } = useServiceListings({
    search, page, categoryId, city, serviceLocation, minPrice, maxPrice, sortBy, sortOrder,
  });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;
  const searchParams = Object.fromEntries(sp.entries());

  if (isLoading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  if (isError) return <div className="text-center py-12 text-destructive">حدث خطأ أثناء تحميل الخدمات</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total > 0 ? `${total} خدمة` : 'لا توجد نتائج'}
        {search && <> بحثاً عن «<span className="font-medium text-foreground">{search}</span>»</>}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد خدمات"
          description={search ? `لم نجد نتائج لـ "${search}"` : 'لا توجد خدمات مطابقة لهذه الفلاتر'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((listing) => (
            <ServiceListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.services}
          searchParams={searchParams}
        />
      )}
    </div>
  );
}
