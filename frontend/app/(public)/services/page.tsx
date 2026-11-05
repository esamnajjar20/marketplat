import type { Metadata } from 'next';
import { ServicesPageShell } from '@/components/services/ServicesPageShell';
import { fetchPublicBrowsePage } from '@/lib/prefetch';
import { getBrowseNumber, getBrowseParam, SSR_BROWSE_MAX_CACHE_AGE_MS, SSR_BROWSE_PAGE_SIZE, SSR_BROWSE_REVALIDATE_SECONDS, type BrowseSearchParams } from '@/lib/browseSearchParams';
import { buildMetadata } from '@/lib/seo';
import type { BrowsePage } from '@/types/browse.types';
import type { ServiceListingWithProvider } from '@/types/service.types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'الخدمات', path: '/services' });

type ServicesPageProps = {
  searchParams?: Promise<BrowseSearchParams>;
};

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const params: BrowseSearchParams = searchParams ? await searchParams : {};
  const browseParams = {
    page: 1,
    limit: SSR_BROWSE_PAGE_SIZE,
    search: getBrowseParam(params, 'search'),
    categoryId: getBrowseParam(params, 'categoryId'),
    serviceTypeId: getBrowseParam(params, 'serviceTypeId'),
    providerId: getBrowseParam(params, 'providerId'),
    city: getBrowseParam(params, 'city'),
    serviceLocation: getBrowseParam(params, 'serviceLocation'),
    minPrice: getBrowseNumber(params, 'minPrice'),
    maxPrice: getBrowseNumber(params, 'maxPrice'),
    sortBy: getBrowseParam(params, 'sortBy') ?? 'createdAt',
    sortOrder: getBrowseParam(params, 'sortOrder') ?? 'desc',
  };

  let initialPage: BrowsePage<ServiceListingWithProvider> | null = null;
  try {
    initialPage = await fetchPublicBrowsePage<ServiceListingWithProvider>(
      '/service-listings',
      browseParams,
      { revalidateSeconds: SSR_BROWSE_REVALIDATE_SECONDS, timeoutMs: 3_000 },
    );
  } catch {
    // The existing client query handles retries and offline fallback.
  }

  return (
    <ServicesPageShell
      initialPage={initialPage}
      searchParams={params}
      initialPageUpdatedAt={initialPage ? Date.now() - SSR_BROWSE_MAX_CACHE_AGE_MS : undefined}
    />
  );
}
