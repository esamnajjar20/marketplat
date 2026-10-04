'use client';

import { LIST_SERVICE_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { cn } from '@/lib/utils';
import { Button } from '@/components/shared/ui/Button';

import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { ServiceListingCard } from './ServiceListingCard';
import { Pagination } from '@/components/shared/ui/Pagination';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';
import { SaveSearchButton } from '@/components/ads/SaveSearchButton';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { ROUTES } from '@/lib/constants';
import type { ServiceListingSortField } from '@/types/service.types';

export function ServiceListingsGrid() {
  const sp = useSearchParams();

  const search = sp.get('search') ?? undefined;
  // SW-FIX-PAGE-NAN: clamp URL page param to positive integer.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const categoryId = sp.get('categoryId') ?? undefined;
  const providerId = sp.get('providerId') ?? undefined;
  const city = sp.get('city') ?? undefined;
  const serviceLocation = (sp.get('serviceLocation') as 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE' | undefined) ?? undefined;
  const minPrice = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  const sortBy = (sp.get('sortBy') as ServiceListingSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

  const { data, isLoading, isFetching, isError, isPlaceholderData, refetch } = useServiceListings({
    search, page, categoryId, providerId, city, serviceLocation, minPrice, maxPrice, sortBy, sortOrder,
  });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;
  const searchParams = Object.fromEntries(sp.entries());

  // FIX UX-04: mirrors the same fix in SearchResults — a centered
  // spinner replaced the whole grid on every filter change instead of
  // a skeleton shaped like the actual cards.

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        <div className={cn(LIST_SERVICE_GRID_CLASS)}>
          {Array.from({ length: 9 }).map((_, i) => <ServiceListingCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (isError) {
    // UX-FIX P1-4: mirrors the same fix in SearchResults — a static red
    // line with no way to recover from a transient failure short of a
    // full reload.
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-destructive">حدث خطأ أثناء تحميل الخدمات</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* SLOW-NET phase4 */}
      <ListDataStatus isFetching={isFetching} hasData={Boolean(data)} isPlaceholderData={isPlaceholderData} />
      <div className="space-y-4">
      {/* Toolbar — queryParamKey="search" for the same reason as
          ProductsGrid.tsx (see SaveSearchButton's own doc comment). */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total > 0 ? `${total} خدمة` : 'لا توجد نتائج'}
          {search && <> بحثاً عن «<span className="font-medium text-foreground">{search}</span>»</>}
        </p>
        <SaveSearchButton type="services" queryParamKey="search" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="لا توجد خدمات"
          description={search ? `لم نجد نتائج لـ "${search}"` : 'لا توجد خدمات مطابقة لهذه الفلاتر'}
        />
      ) : (
        <div className={cn(LIST_SERVICE_GRID_CLASS, "stagger-fade-in")}>
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
      </>
  );
}
