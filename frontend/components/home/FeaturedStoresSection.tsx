'use client';

import { Store as StoreIcon } from 'lucide-react';
import { StoreCard } from '@/components/stores/StoreCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useStores } from '@/hooks/queries/useStores';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { homeSectionLimit } from '@/lib/listLimits';
import { ROUTES } from '@/lib/constants';

/**
 * متاجر مميزة — ACTIVE عبر الـ API، مع شارة مدينة إن وُجدت.
 * لا lat/lng على GET /stores؛ المدينة فقط.
 */
export function FeaturedStoresSection() {
  const location = useLocationResolver();
  const city = location.source === 'city' ? location.city : undefined;
  const { data, isLoading } = useStores({ limit: homeSectionLimit(6, 4), city });
  const items = data?.items ?? [];

  const badgeSource =
    location.source === 'city' && city
      ? ('city' as const)
      : ('general' as const);

  const header = (
    <SectionHeader
      eyebrow="مميز"
      title="متاجر مميزة"
      icon={<StoreIcon className="h-3.5 w-3.5 text-accent" />}
      cta={{ href: ROUTES.stores, label: 'عرض الكل ←' }}
      badge={
        !isLoading ? (
          <LocationSourceBadge source={badgeSource} city={city} />
        ) : undefined
      }
    />
  );

  if (isLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-10 section-enter">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 sm:w-auto">
              <StoreCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 pt-10 section-enter">
      {header}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 md:grid-cols-3 stagger-fade-in">
        {items.map((store) => (
          <div key={store.id} className="w-72 shrink-0 sm:w-auto">
            <StoreCard store={store} />
          </div>
        ))}
      </div>
    </section>
  );
}
