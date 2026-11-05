import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { SellersRankingClient } from '@/components/sellers/SellersRankingClient';
import { buildMetadata } from '@/lib/seo';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { fetchServerApi } from '@/lib/server/serverApiFetch';
import type { SellerRankingRow } from '@/types/seller-ranking.types';
import { normalizeSellerRankingRows } from '@/lib/sellerRanking';

export const metadata: Metadata = buildMetadata({
  title: 'أفضل البائعين',
  description: 'ترتيب البائعين حسب التقييم والثقة وسرعة الرد',
});

const RANKING_LIMIT = 30;

export default async function SellersRankingPage() {
  const queryClient = getQueryClient();
  const queryKey = queryKeys.sellers.ranking(RANKING_LIMIT);
  let persistServerSeed = false;

  try {
    const response = await fetchServerApi<SellerRankingRow[]>(
      `/sellers/ranking?limit=${RANKING_LIMIT}`,
      { mode: 'no-store', timeoutMs: 2_500 },
    );
    if (!Array.isArray(response.data)) {
      throw new Error('Seller ranking response did not contain a list');
    }

    queryClient.setQueryData(queryKey, normalizeSellerRankingRows(response.data));
    persistServerSeed = true;
  } catch {
    // Keep the client query and its offline snapshot fallback available when
    // the public ranking endpoint is temporarily unavailable during SSR.
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 py-6 pb-0 md:pb-8 sm:px-4 sm:py-8">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <SellersRankingClient limit={RANKING_LIMIT} persistServerSeed={persistServerSeed} />
      </HydrationBoundary>
    </div>
  );
}
