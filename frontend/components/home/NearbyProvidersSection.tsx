'use client';

import { LocateFixed } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { ROUTES } from '@/lib/constants';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';

export function NearbyProvidersSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(6, 4, dataSaver);
  const feed = useHomeFeed();
  const rail = feed.data?.rails.providers;
  const items = rail?.items.slice(0, limit) ?? [];
  const showSkeleton = feed.isPending;

  const header = (
    <SectionHeader
      tone="nearby"
      eyebrow={rail?.source === 'city' ? 'قريبون منك' : 'اكتشف'}
      title={rail?.source === 'city' ? 'مقدمو خدمات في مدينتك' : 'مقدمو خدمات'}
      icon={<LocateFixed className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.serviceProviders, label: 'عرض الكل ←' }}
      badge={!showSkeleton ? <LocationSourceBadge source={rail?.source ?? 'general'} quiet /> : undefined}
    />
  );

  if (showSkeleton) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 sm:w-auto"><StoreCardSkeleton /></div>
          ))}
        </div>
      </section>
    );
  }

  if (feed.isError) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
        {header}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-8 text-center text-sm">
          <p className="text-destructive">تعذّر تحميل مقدمي الخدمات</p>
          <button type="button" onClick={() => void feed.refetch()} className="text-primary hover:underline">إعادة المحاولة</button>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
        {header}
        <EmptyState icon={<LocateFixed />} title="لا يوجد مقدمو خدمات بعد" description="سيظهر مقدمو الخدمات هنا عند توفرها." compact />
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
      {header}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 stagger-fade-in">
        {items.map((provider) => (
          <div key={provider.id} className="w-72 shrink-0 sm:w-auto"><ServiceProviderCard provider={provider} /></div>
        ))}
      </div>
    </section>
  );
}
