import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import { buildMetadata } from '@/lib/seo';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { fetchServerApi, isNextProductionBuild } from '@/lib/server/serverApiFetch';
import type { MixedRecommendations } from '@/api/recommendations.api';
import { APP_NAME } from '@/lib/constants';
import { Skeleton } from '@/components/shared/ui/Skeleton';

const SuggestionsPageClient = nextDynamic(
  () =>
    import('@/components/suggestions/SuggestionsPageClient').then(
      (module) => module.SuggestionsPageClient,
    ),
  { loading: () => <div className="mx-auto max-w-7xl space-y-4 p-4"><Skeleton className="h-12 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div> },
);

// Keep this page request-rendered. Skip only the optional API prefetch during
// the build; runtime SSR still uses the Cloudflare API service binding.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'الرائج',
  description: `اكتشف الإعلانات والمنتجات والخدمات الأكثر رواجًا في ${APP_NAME}.`,
  path: '/trending',
});

export default async function TrendingPage() {
  const queryClient = getQueryClient();
  const params = { limit: 16 };

  // Trending is public and intentionally uses the guest cache scope. The
  // personalized /for-you and /suggestions pages remain client-fetched because
  // the server does not possess the user's bearer token or private signals.
  if (!isNextProductionBuild()) {
    try {
      const response = await fetchServerApi<MixedRecommendations>(
        '/recommendations?type=mixed&limit=16',
        { mode: 'no-store', timeoutMs: 3_000 },
      );
      if (response.data) {
        queryClient.setQueryData(queryKeys.recommendations.mixed(params, 'guest'), response.data);
      }
    } catch {
      // The client mixed query remains the resilient fallback.
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SuggestionsPageClient mode="trending" />
    </HydrationBoundary>
  );
}
