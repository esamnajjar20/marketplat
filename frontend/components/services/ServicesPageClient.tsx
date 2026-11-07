'use client';

import dynamic from 'next/dynamic';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { Users } from 'lucide-react';
import { ListPageShell } from '@/components/shared/list/ListPageShell';
import { ROUTES } from '@/lib/constants';
import type { BrowsePage } from '@/types/browse.types';
import type { ServiceListingWithProvider } from '@/types/service.types';
import type { BrowseSearchParams } from '@/lib/browseSearchParams';

const ServiceCategoryFilter = dynamic(
  () => import('@/components/services/ServiceCategoryFilter').then((module) => module.ServiceCategoryFilter),
  { ssr: false, loading: () => <div className="min-h-20" aria-hidden="true" /> },
);
const ServiceFiltersSheet = dynamic(
  () => import('@/components/services/ServiceFiltersSheet').then((module) => module.ServiceFiltersSheet),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const ServiceListingsGrid = dynamic(
  () => import('@/components/services/ServiceListingsGrid').then((module) => module.ServiceListingsGrid),
  {
    loading: () => (
      <div className="space-y-3 py-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">جارٍ تحميل الخدمات…</p>
        <div className="space-y-2.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      </div>
    ),
  },
);
const ServiceSearchSortBarWrapper = dynamic(
  () => import('@/components/services/ServiceSearchSortBarWrapper').then((module) => module.ServiceSearchSortBarWrapper),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);
const ServiceCategoryChips = dynamic(
  () => import('@/components/services/ServiceCategoryChips').then((module) => module.ServiceCategoryChips),
  { ssr: false, loading: () => <div className="h-8" aria-hidden="true" /> },
);

/**
 * صفحة الخدمات — مطابقة لتصميم المرجع (قائمة أفقية + شرائح تصنيفات).
 */
interface ServicesPageClientProps {
  initialPage?: BrowsePage<ServiceListingWithProvider> | null;
  initialPageUpdatedAt?: number;
  searchParams?: BrowseSearchParams;
}

export function ServicesPageClient({ initialPage, initialPageUpdatedAt, searchParams }: ServicesPageClientProps = {}) {
  return (
    <ListPageShell
      title="الخدمات"
      description="تصفح الخدمات المحلية في سوق غزة"
      className="bg-[var(--legacy-page-surface)] dark:bg-background"
      headerEnd={
        <IntentPrefetchLink
          href={ROUTES.serviceProviders}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--legacy-border)] bg-card px-3 text-xs font-bold text-[var(--legacy-primary-deep)] shadow-sm hover:border-primary/40 dark:border-border dark:bg-card dark:text-primary" prefetch={false}
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          مقدمو الخدمة
        </IntentPrefetchLink>
      }
      toolbar={
        <div className="flex w-full flex-col gap-3">
          <div className="min-w-0 w-full">
            <ServiceSearchSortBarWrapper />
          </div>
          <ServiceCategoryChips />
          <div className="lg:hidden">
            <ServiceFiltersSheet />
          </div>
        </div>
      }
      sidebar={<ServiceCategoryFilter />}
    >
      <ServiceListingsGrid initialPage={initialPage} initialPageUpdatedAt={initialPageUpdatedAt} searchParams={searchParams} />
    </ListPageShell>
  );
}
