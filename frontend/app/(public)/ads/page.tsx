import type { Metadata } from 'next';
import { AdsPageClient } from '@/components/ads/AdsPageClient';
import { fetchPublicBrowsePage } from '@/lib/prefetch';
import { getBrowseNumber, getBrowseParam, SSR_BROWSE_MAX_CACHE_AGE_MS, SSR_BROWSE_PAGE_SIZE, SSR_BROWSE_REVALIDATE_SECONDS, type BrowseSearchParams } from '@/lib/browseSearchParams';
import { buildMetadata } from '@/lib/seo';
import type { BrowsePage } from '@/types/browse.types';
import type { AdListItem } from '@/types/ad.types';

// Keep request-time URL handling and the existing CSP/nonce architecture.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({ title: 'الإعلانات', path: '/ads' });

type AdsPageProps = {
  searchParams?: Promise<BrowseSearchParams>;
};

export default async function AdsPage({ searchParams }: AdsPageProps) {
  const params: BrowseSearchParams = searchParams ? await searchParams : {};
  const q = getBrowseParam(params, 'q') ?? '';
  const isSearch = q.trim().length >= 2;

  const browseParams = {
    page: 1,
    limit: SSR_BROWSE_PAGE_SIZE,
    ...(isSearch ? { q } : {}),
    categoryId: getBrowseParam(params, 'categoryId'),
    city: getBrowseParam(params, 'city'),
    condition: getBrowseParam(params, 'condition'),
    minPrice: getBrowseNumber(params, 'minPrice'),
    maxPrice: getBrowseNumber(params, 'maxPrice'),
    sortBy: getBrowseParam(params, 'sortBy') ?? 'createdAt',
    sortOrder: getBrowseParam(params, 'sortOrder') ?? 'desc',
  };

  let initialPage: BrowsePage<AdListItem> | null = null;
  try {
    initialPage = await fetchPublicBrowsePage<AdListItem>(
      isSearch ? '/ads/search' : '/ads',
      browseParams,
      { revalidateSeconds: SSR_BROWSE_REVALIDATE_SECONDS, timeoutMs: 3_000 },
    );
  } catch {
    // The client query remains active and keeps its existing retry/offline path.
  }

  return (
    <AdsPageClient
      initialPage={initialPage}
      searchParams={params}
      initialPageUpdatedAt={initialPage ? Date.now() - SSR_BROWSE_MAX_CACHE_AGE_MS : undefined}
    />
  );
}
