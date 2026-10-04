import type { Metadata } from 'next';
import Link from 'next/link';
import { Users, Wrench } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';
import { NearbyServiceProviders } from '@/components/services/NearbyServiceProviders';
import { PageHeader } from '@/components/shared/layout/PageHeader';

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
      <div className="container mx-auto max-w-7xl px-3 pt-5 sm:px-4 sm:pt-7">
        <PageHeader
          icon={<Users className="h-6 w-6" />}
          title="مقدمو الخدمة"
          description="ابحث عن مقدّم قريب منك أو في مدينتك"
          actions={
            <Link
              href={ROUTES.services}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium text-primary shadow-xs hover:border-primary/30 hover:bg-primary-soft/40"
            >
              <Wrench className="h-4 w-4" aria-hidden />
              عروض الخدمات
            </Link>
          }
        />
      </div>

      <div className="container mx-auto max-w-7xl space-y-5 px-3 pt-4 sm:px-4 sm:pt-6">
        <NearbyServiceProviders />
      </div>
    </div>
  );
}
