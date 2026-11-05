import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { PublicSalesStats } from '@/components/stores/PublicSalesStats';
import { buildMetadata } from '@/lib/seo';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { fetchServerApi } from '@/lib/server/serverApiFetch';
import type { PublicStoreSalesStats } from '@/types/public-store-stats.types';

export const metadata: Metadata = buildMetadata({ title: 'إحصائيات المتجر', path: '/store' });

export default async function PublicStoreStatsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  try {
    const response = await fetchServerApi<PublicStoreSalesStats>(
      `/public/stores/${encodeURIComponent(slug)}/stats`,
      { mode: 'no-store', timeoutMs: 2_500 },
    );
    if (!response.data) throw new Error('Public store statistics response is empty');
    queryClient.setQueryData(queryKeys.publicStoreSalesStats(slug), response.data);
  } catch {
    // The client component retains its existing loading/error/retry path.
  }

  return (
    <main className="container mx-auto px-3 py-8 sm:px-4">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PublicSalesStats slug={slug} />
      </HydrationBoundary>
    </main>
  );
}
