'use client';

import { LocateFixed } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { useProviderRecommendations } from '@/hooks/queries/useRecommendations';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES } from '@/lib/constants';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';

/**
 * FEAT-HOME-NEARBY-PROVIDERS: "مقدمو خدمات قريبون منك" section for
 * Home. The homepage uses the browse city when available and falls
 * back to the general service-provider directory otherwise.
 *
 * Loading state uses the same horizontal skeleton layout regardless
 * of the active source. The location badge reflects the source of the
 * data currently shown.
 */
export function NearbyProvidersSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(6, 4, dataSaver);
  const { isChecking, data, isLoading, isError, source, refetch } =
    useNearbyProvidersForHome();
  const { city, isReady } = useBrowseCity();
  const isHydrated = useAuthStore(selectIsHydrated);
  const isAuth = useAuthStore(selectIsAuthenticated);
  const ranked = useProviderRecommendations(
    { limit, ...(city ? { city } : {}) },
    { enabled: isHydrated && isReady, scope: isAuth ? 'user' : 'guest' },
  );

  const items = (ranked.data?.length ? ranked.data : data?.items ?? []).slice(0, limit);
  const showSkeleton = isChecking || isLoading || (ranked.isLoading && items.length === 0);
  const badgeCity = source === 'city' ? city : undefined;

  const header = (
    <SectionHeader
      tone="nearby"
      eyebrow={source === 'city' ? 'قريبون منك' : 'اكتشف'}
      title={source === 'city' ? 'مقدمو خدمات في مدينتك' : 'مقدمو خدمات'}
      icon={<LocateFixed className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.serviceProviders, label: 'عرض الكل ←' }}
      badge={
        !showSkeleton ? (
          <LocationSourceBadge source={source} city={badgeCity} requestedCity={city} quiet />
        ) : undefined
      }
    />
  );

  // Loading covers both the resolver itself settling (isChecking) and
  // the resulting query fetching (isLoading) — shown as one continuous
  // skeleton so there's no flash of nothing while the resolver decides
  // which source to use. A real fetch error just quietly renders
  // nothing further below — no destructive error banner on the
  // homepage for what's a secondary discovery section.
  if (showSkeleton) {
    // TOKENS-01 [SECTION]: was border-emerald-500/15 bg-emerald-500/[0.04]
    return (
      <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 sm:w-auto">
              <StoreCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
        {header}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-8 text-center text-sm">
          <p className="text-destructive">تعذّر تحميل مقدمي الخدمات</p>
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="text-primary hover:underline"
          >
            إعادة المحاولة
          </button>
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
        {header}
        <EmptyState
          icon={<LocateFixed />}
          title="لا يوجد مقدمو خدمات بعد"
          description="سيظهر مقدمو الخدمات هنا عند توفرهم."
          compact
        />
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl border border-brand-nearby/15 bg-brand-nearby/[0.04] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
      {header}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 stagger-fade-in">
        {items.map((provider) => (
          <div key={provider.id} className="w-72 shrink-0 sm:w-auto">
            <ServiceProviderCard provider={provider} />
          </div>
        ))}
      </div>
    </section>
  );
}
