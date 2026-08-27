'use client';

import { Store as StoreIcon } from 'lucide-react';
import { StoreCard } from '@/components/stores/StoreCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useStores } from '@/hooks/queries/useStores';
import { homeSectionLimit } from '@/lib/listLimits';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { ROUTES } from '@/lib/constants';

/**
 * FEAT-HOME-DISCOVERY: "متاجر مميزة" Home section. No client-side
 * plan filter needed and no new query param added to StoresQuery —
 * stores.repository.ts's GET /stores already orders every result
 * `orderBy: [{ plan: 'desc' }, ...]` unconditionally (FEATURED stores
 * always sort first, on every call, not just this one), so a plain
 * useStores({ limit: 6 }) with no extra params already surfaces
 * FEATURED stores first and only backfills with FREE-plan stores if
 * fewer than 6 FEATURED ones exist. Same hook StoresGrid/`/stores`
 * itself uses.
 *
 * Self-contained like NearbyProvidersSection/RecentProductsSection —
 * own heading, self-hides entirely (heading included) when there's
 * genuinely nothing to show yet, rather than an empty section on a
 * brand-new marketplace.
 *
 * Phase 4: same city-only wiring as RecentProductsSection — GET
 * /stores has no lat/lng param, only city, so only the resolver's
 * 'city' source maps here; other sources fall through to the
 * general FEATURED-first list unfiltered by location.
 */
export function FeaturedStoresSection() {
  const location = useLocationResolver();
  const city = location.source === 'city' ? location.city : undefined;
  const { data, isLoading } = useStores({ limit: homeSectionLimit(6, 4), city });
  const items = data?.items ?? [];

  const header = (
    <SectionHeader
      eyebrow="مميز"
      title="متاجر مميزة"
      icon={<StoreIcon className="h-3.5 w-3.5 text-accent" />}
      cta={{ href: ROUTES.stores, label: 'عرض الكل ←' }}
    />
  );

  if (isLoading) {
    return (
      <section className="container mx-auto space-y-4 px-4 pt-10">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
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
    <section className="container mx-auto space-y-4 px-4 pt-10">
      {header}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 stagger-fade-in">
        {items.map((store) => (
          <div key={store.id} className="w-72 shrink-0 sm:w-auto">
            <StoreCard store={store} />
          </div>
        ))}
      </div>
    </section>
  );
}
