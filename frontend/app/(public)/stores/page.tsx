import type { Metadata } from 'next';
import { StoresPageClient } from '@/components/stores/StoresPageClient';
import { fetchPublicBrowsePage } from '@/lib/prefetch';
import { getBrowseParam, SSR_BROWSE_MAX_CACHE_AGE_MS, SSR_BROWSE_PAGE_SIZE, SSR_BROWSE_REVALIDATE_SECONDS, type BrowseSearchParams } from '@/lib/browseSearchParams';
import { buildMetadata } from '@/lib/seo';
import type { BrowsePage } from '@/types/browse.types';
import type { StoreDirectoryItem } from '@/types/store.types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'المتاجر', path: '/stores' });

type StoresPageProps = {
  searchParams?: Promise<BrowseSearchParams>;
};

export default async function StoresPage({ searchParams }: StoresPageProps) {
  const params: BrowseSearchParams = searchParams ? await searchParams : {};
  const browseParams = {
    page: 1,
    limit: SSR_BROWSE_PAGE_SIZE,
    search: getBrowseParam(params, 'search'),
    city: getBrowseParam(params, 'city'),
    sortBy: getBrowseParam(params, 'sortBy') ?? 'createdAt',
    sortOrder: getBrowseParam(params, 'sortOrder') ?? 'desc',
  };

  let initialPage: BrowsePage<StoreDirectoryItem> | null = null;
  try {
    initialPage = await fetchPublicBrowsePage<StoreDirectoryItem>(
      '/stores',
      browseParams,
      { revalidateSeconds: SSR_BROWSE_REVALIDATE_SECONDS, timeoutMs: 3_000 },
    );
  } catch {
    // Keep the client query as the recovery path for API/network failures.
  }

  return (
    <StoresPageClient
      initialPage={initialPage}
      searchParams={params}
      initialPageUpdatedAt={initialPage ? Date.now() - SSR_BROWSE_MAX_CACHE_AGE_MS : undefined}
    />
  );
}
