import type { Metadata } from 'next';
import { ProductsPageClient } from '@/components/stores/ProductsPageClient';
import { fetchPublicBrowsePage } from '@/lib/prefetch';
import { getBrowseParam, SSR_BROWSE_MAX_CACHE_AGE_MS, SSR_BROWSE_PAGE_SIZE, SSR_BROWSE_REVALIDATE_SECONDS, type BrowseSearchParams } from '@/lib/browseSearchParams';
import { buildMetadata } from '@/lib/seo';
import type { BrowsePage } from '@/types/browse.types';
import type { ProductWithStore } from '@/types/product.types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'المنتجات', path: '/products' });

type ProductsPageProps = {
  searchParams?: Promise<BrowseSearchParams>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params: BrowseSearchParams = searchParams ? await searchParams : {};
  const hasPromotion = getBrowseParam(params, 'hasPromotion') === 'true' ? true : undefined;
  const browseParams = {
    page: 1,
    limit: SSR_BROWSE_PAGE_SIZE,
    search: getBrowseParam(params, 'search'),
    city: getBrowseParam(params, 'city'),
    categoryId: getBrowseParam(params, 'categoryId'),
    sortBy: getBrowseParam(params, 'sortBy') ?? 'createdAt',
    sortOrder: getBrowseParam(params, 'sortOrder') ?? 'desc',
    hasPromotion,
  };

  let initialPage: BrowsePage<ProductWithStore> | null = null;
  try {
    initialPage = await fetchPublicBrowsePage<ProductWithStore>(
      '/products',
      browseParams,
      { revalidateSeconds: SSR_BROWSE_REVALIDATE_SECONDS, timeoutMs: 3_000 },
    );
  } catch {
    // Fall back to the existing browser query when the server prefetch is unavailable.
  }

  return (
    <ProductsPageClient
      initialPage={initialPage}
      searchParams={params}
      initialPageUpdatedAt={initialPage ? Date.now() - SSR_BROWSE_MAX_CACHE_AGE_MS : undefined}
    />
  );
}
