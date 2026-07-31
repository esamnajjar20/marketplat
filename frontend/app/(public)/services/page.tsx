import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { LocateFixed } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';
import { ServiceCategoryFilter } from '@/components/services/ServiceCategoryFilter';
import { ServiceListingsGrid } from '@/components/services/ServiceListingsGrid';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'الخدمات', path: '/services' });

export default function ServicesPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">الخدمات والأعمال الصغيرة</h1>
        <Link
          href={ROUTES.serviceProviders}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <LocateFixed className="h-4 w-4" />
          مقدمو خدمة قريبون منك
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <Suspense><ServiceCategoryFilter /></Suspense>
        </aside>
        <main className="lg:col-span-3">
          <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
            <ServiceListingsGrid />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
