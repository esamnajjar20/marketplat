'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LocateFixed, Wrench } from 'lucide-react';
import { ListPageShell } from '@/components/shared/list/ListPageShell';
import { ROUTES } from '@/lib/constants';

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
  { ssr: false, loading: () => <div className="space-y-3 py-4" role="status" aria-live="polite"><p className="text-sm text-muted-foreground">جارٍ تحميل الخدمات…</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />)}</div></div> },
);
const ServiceSearchSortBarWrapper = dynamic(
  () => import('@/components/services/ServiceSearchSortBarWrapper').then((module) => module.ServiceSearchSortBarWrapper),
  { ssr: false, loading: () => <div className="min-h-10" aria-hidden="true" /> },
);

export function ServicesPageClient() {
  return (
    <ListPageShell
      icon={<Wrench className="h-6 w-6" />}
      title="الخدمات والأعمال الصغيرة"
      description="تصفح خدمات مقدّمي الخدمة في سوق غزة"
      headerEnd={<Link href={ROUTES.serviceProviders} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-primary hover:underline"><LocateFixed className="h-4 w-4" aria-hidden />مقدمو الخدمة</Link>}
      toolbar={<><ServiceFiltersSheet /><div className="min-w-0 flex-1 sm:flex-none sm:w-48 lg:ms-auto"><ServiceSearchSortBarWrapper /></div></>}
      sidebar={<ServiceCategoryFilter />}
    >
      <ServiceListingsGrid />
    </ListPageShell>
  );
}
