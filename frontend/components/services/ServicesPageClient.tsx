'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Users } from 'lucide-react';
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
  {
    ssr: false,
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
export function ServicesPageClient() {
  return (
    <ListPageShell
      title="الخدمات والأعمال الصغيرة"
      description="تصفح خدمات مقدّمي الخدمة في سوق غزة"
      className="bg-[#FBF9F4] dark:bg-background"
      headerEnd={
        <Link
          href={ROUTES.serviceProviders}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#EAE3D6] bg-white px-3 text-xs font-bold text-[#1F4D33] shadow-sm hover:border-primary/40 dark:border-border dark:bg-card dark:text-primary"
        >
          <Users className="h-3.5 w-3.5" aria-hidden />
          مقدمو الخدمة
        </Link>
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
      <ServiceListingsGrid />
    </ListPageShell>
  );
}
