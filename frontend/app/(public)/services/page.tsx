import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { LocateFixed, Wrench } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';
import { ServiceCategoryFilter } from '@/components/services/ServiceCategoryFilter';
import { ServiceListingsGrid } from '@/components/services/ServiceListingsGrid';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'الخدمات', path: '/services' });

export default function ServicesPage() {
  return (
    <div className="pb-8">
      {/*
        P2 FIX (layout audit §1, header /stores vs /services): this page
        previously had a plain <h1>, no icon-badge — while /stores'
        own header comment claimed the two already matched, which they
        didn't. Now uses the same icon-badge + bg-secondary/40 band
        treatment as /stores (and /categories/[slug]'s CategoryHero),
        so the two "browse + filter" list pages read as siblings. The
        "مقدمو الخدمة" link is service-specific and stays — it has no
        equivalent on /stores. Label updated from the old "قريبون منك"
        wording to match /service-providers' own heading now that that
        page is a gps→city→general directory, not GPS-only (see
        useServiceProvidersDirectory's doc).
      */}
      <div className="border-b bg-secondary/40">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wrench className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">الخدمات والأعمال الصغيرة</h1>
              <p className="text-sm text-muted-foreground">تصفح خدمات مقدّمي الخدمة في سوق غزة</p>
            </div>
          </div>
          <Link
            href={ROUTES.serviceProviders}
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <LocateFixed className="h-4 w-4" />
            مقدمو الخدمة
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 pt-6">
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
    </div>
  );
}
