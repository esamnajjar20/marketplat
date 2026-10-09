'use client';

import { useQuery } from '@tanstack/react-query';
import { homeFeedApi, type HomeFeedPayload } from '@/api/home-feed.api';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { queryKeys } from '@/lib/queryKeys';

/** The homepage's only network read. Every home section consumes this cache. */
export function useHomeFeed() {
  const isHydrated = useAuthStore(selectIsHydrated);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { city, explicitAll, isReady } = useBrowseCity();
  const identity = userId ?? null;

  return useQuery({
    queryKey: queryKeys.home.feed(city, identity, explicitAll),
    enabled: isHydrated && isReady,
    queryFn: async (): Promise<HomeFeedPayload> => {
      const payload = await homeFeedApi.get({ city, explicitAll }).then((response) => response.data.data);
      if (!payload) throw new Error('empty /home/feed response');
      return payload;
    },
    placeholderData: (previous) => {
      // Keep the previous city visible only for the same identity. Never show
      // another user's personalized feed while the auth identity changes.
      return previous?.meta.personalized === Boolean(identity) ? previous : undefined;
    },
    staleTime: CACHE_TTL.recommendations,
    refetchOnWindowFocus: false,
  });
}
