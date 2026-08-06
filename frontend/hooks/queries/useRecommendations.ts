/**
 * Recommendations query hook (Gap #9 — "قد يعجبك أيضًا").
 *
 * Two call shapes, matching the two modes recommendations.service.ts
 * supports on the backend:
 *   - useRecommendations()                    → personalized home-feed
 *     rail (or trending, for a logged-out visitor / one with no
 *     signal history yet).
 *   - useRecommendations({ excludeAdId: id }) → "related to this ad"
 *     rail for the ad-detail page, ranked by that ad's own category.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { recommendationsApi, GetRecommendationsParams } from '@/api/recommendations.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

export function useRecommendations(params?: GetRecommendationsParams) {
  return useQuery({
    queryKey: queryKeys.recommendations.list(params),
    queryFn: () => recommendationsApi.getRecommendations(params).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.recommendations,
  });
}
