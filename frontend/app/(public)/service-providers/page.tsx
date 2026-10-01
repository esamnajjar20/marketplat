import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, Wrench } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';
import { NearbyServiceProviders } from '@/components/services/NearbyServiceProviders';

export const metadata: Metadata = buildMetadata({
  title: 'مقدمو الخدمة',
  path: '/service-providers',
});

/**
 * صفحة دليل مقدمي الخدمة — موقع/مدينة أولاً.
 * فلاتر السعر والفئة تنتمي لصفحة /services (عروض الخدمات) وليس هنا.
 */
export default function ServiceProvidersPage() {
  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:pb-8">
      <header className="border-b border-border/70 bg-secondary/40">
        <div className="container mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-3 py-4 sm:px-4 sm:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
              aria-hidden
            >
              <Users className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-balance text-lg font-bold tracking-tight sm:text-2xl">
                مقدمو الخدمة
              </h1>
              <p className="mt-0.5 text-pretty text-xs text-muted-foreground sm:text-sm">
                ابحث عن مقدّم قريب منك أو في مدينتك
              </p>
            </div>
          </div>
          <Link
            href={ROUTES.services}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-primary hover:underline"
          >
            <Wrench className="h-4 w-4" aria-hidden />
            عروض الخدمات
          </Link>
        </div>
      </header>

      <div className="container mx-auto max-w-7xl space-y-4 px-3 pt-4 sm:px-4 sm:pt-6">
        <NearbyServiceProviders />
      </div>
    </div>
  );
}
