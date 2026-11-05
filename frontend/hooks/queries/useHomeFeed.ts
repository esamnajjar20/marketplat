'use client';

import { useQuery } from '@tanstack/react-query';
import { homeFeedApi, type HomeFeedPayload } from '@/api/home-feed.api';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { queryKeys } from '@/lib/queryKeys';
import { useMounted } from '@/hooks/useMounted';

/** The homepage's only network read. Every home section consumes this cache. */
export function useHomeFeed() {
  const isHydrated = useAuthStore(selectIsHydrated);
  // FIX HYDRATION-418-HOME-01: app/(public)/page.tsx prefetches the GUEST feed
  // (identity=null) on the server. The persisted `user` is already present on the
  // first client render, which changed the query key → no dehydrated data →
  // `isPending` → skeleton on the client vs full content in the server HTML
  // (React #418). Until mounted we use the same identity the server used; the
  // real identity applies right after hydration.
  const mounted = useMounted();
  const userId = useAuthStore((state) => (mounted ? (state.user?.id ?? null) : null));
  const { city, explicitAll, isReady } = useBrowseCity();
  const identity = userId ?? null;

  return useQuery({
    queryKey: queryKeys.home.feed(city, identity, explicitAll),
    enabled: isHydrated && isReady,
    queryFn: async (): Promise<HomeFeedPayload> => {
      // Anonymous visitors read the public, edge-cached /home/static; only a signed-in
      // user pays for the private, personalised /home/feed. Same payload shape.
      const request = identity
        ? homeFeedApi.get({ city, explicitAll })
        : homeFeedApi.getStatic({ city, explicitAll });
      const payload = await request.then((response) => response.data.data);
      if (!payload) throw new Error(`empty /home/${identity ? 'feed' : 'static'} response`);
      return payload;
    },
    placeholderData: (previous) => {
      if (!previous) return undefined;
      // HOME-FLICKER-01: the server-prefetched guest feed is public data, so it
      // is safe to keep on screen while the real identity/city key loads. Without
      // this, a signed-in user (or a guest with a saved city) lost the SSR data
      // right after hydration -> every section fell back to a skeleton.
      // Never keep a PERSONALIZED feed for a different identity.
      if (previous.meta.personalized === false) return previous;
      return previous.meta.personalized === Boolean(identity) ? previous : undefined;
    },
    staleTime: CACHE_TTL.recommendations,
    refetchOnWindowFocus: false,
  });
}
