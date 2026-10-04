import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { LocateFixed, Wrench } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';
import { ServiceCategoryFilter } from '@/components/services/ServiceCategoryFilter';
import { ServiceFiltersSheet } from '@/components/services/ServiceFiltersSheet';
import { ServiceListingsGrid } from '@/components/services/ServiceListingsGrid';
import { ListPageShell } from '@/components/shared/list/ListPageShell';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';
import { ServiceSearchSortBarWrapper } from '@/components/services/ServiceSearchSortBarWrapper';

export const metadata: Metadata = buildMetadata({ title: 'الخدمات', path: '/services' });

export default function ServicesPage() {
  return (
    <ListPageShell
      icon={<Wrench className="h-6 w-6" />}
      title="الخدمات والأعمال الصغيرة"
      description="تصفح خدمات مقدّمي الخدمة في سوق غزة"
      headerEnd={
        <Link
          href={ROUTES.serviceProviders}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-primary hover:underline"
        >
          <LocateFixed className="h-4 w-4" aria-hidden />
          مقدمو الخدمة
        </Link>
      }
      toolbar={
        <>
          <Suspense><ServiceFiltersSheet /></Suspense>
          <div className="min-w-0 flex-1 sm:flex-none sm:w-48 lg:ms-auto"><Suspense><ServiceSearchSortBarWrapper /></Suspense></div>
        </>
      }
      sidebar={
        <Suspense>
          <ServiceCategoryFilter />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز الخدمات…" />
        }
      >
        <ServiceListingsGrid />
      </Suspense>
    </ListPageShell>
  );
}
