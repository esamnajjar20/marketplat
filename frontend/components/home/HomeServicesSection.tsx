'use client';

import { Briefcase } from 'lucide-react';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { HomeRailShell } from '@/components/home/HomeRailShell';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { useServiceRecommendations } from '@/hooks/queries/useRecommendations';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';

/**
 * خدمات الرئيسية — مدينة البروفايل أو اختيار الضيف (بدون GPS).
 */
export function HomeServicesSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(8, 4, dataSaver);
  const { city, isReady } = useBrowseCity();
  const isHydrated = useAuthStore(selectIsHydrated);
  const isAuth = useAuthStore(selectIsAuthenticated);
  const home = useHomepage();
  const ranked = useServiceRecommendations(
    { limit, ...(city ? { city } : {}) },
    { enabled: isHydrated && isReady, scope: isAuth ? 'user' : 'guest' },
  );
  const seeded = home.data?.belowFold?.homeServices ?? null;
  const hasSeed = seeded !== null && seeded !== undefined;
  const allowFetch = home.isError || (home.isSuccess && !hasSeed);

  const { data, isLoading, isError, error, refetch } = useServiceListings(
    {
      limit,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...(city ? { city } : {}),
    },
    { enabled: allowFetch },
  );

  const rankedItems = ranked.data ?? [];
  const items = rankedItems.length > 0 ? rankedItems.slice(0, limit) : hasSeed ? (seeded!.items ?? []).slice(0, limit) : (data?.items ?? []);
  const showLoading = ranked.isLoading && items.length === 0 ? true : hasSeed ? false : home.isPending || isLoading;
  const showError = hasSeed ? false : isError;

  const header = (
    <SectionHeader
      eyebrow="تصفّح"
      title="خدمات تناسبك"
      icon={<Briefcase className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.services, label: 'عرض الكل ←' }}
      badge={
        !showLoading ? (
          <LocationSourceBadge
            source={seeded?.source ?? (city ? 'city' : 'general')}
            city={seeded?.source === 'city' ? city : undefined}
            requestedCity={city}
            quiet
          />
        ) : undefined
      }
    />
  );

  const status = showLoading ? 'loading' : showError ? 'error' : items.length === 0 ? 'empty' : 'ready';

  return (
    <HomeRailShell
      variant="default"
      header={header}
      status={status}
      skeleton={<ServiceListingCardSkeleton />}
      skeletonCount={4}
      error={error}
      onRetry={() => {
        void home.refetch();
        void refetch();
      }}
      empty={{
        icon: <Briefcase />,
        title: 'لا توجد خدمات بعد',
        description: 'ستظهر الخدمات هنا عند توفرها.',
      }}
    >
      {items.map((listing) => (
        <HomeScrollRailItem key={listing.id}>
          <ServiceListingCard listing={listing} context="public" />
        </HomeScrollRailItem>
      ))}
    </HomeRailShell>
  );
}
