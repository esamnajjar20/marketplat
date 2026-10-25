'use client';

import { useMemo } from 'react';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { useDataSaver } from '@/lib/useDataSaver';
import { buildForYouFeed, type ForYouItem } from '@/lib/forYouFeed';

const HOME_TARGET = 24;
const HOME_TARGET_SAVER = 12;

/**
 * The cards of the "مخصص لك" shelf, assembled from the single /home/feed
 * response. Shared so the per-type rails below it can drop exactly what the
 * shelf already shows (lib/homeDedupe.ts) instead of repeating the same card.
 */
export function useForYouItems(): ForYouItem[] {
  const dataSaver = useDataSaver();
  const feed = useHomeFeed();
  const source = feed.data?.rails.forYou;
  const target = dataSaver ? HOME_TARGET_SAVER : HOME_TARGET;

  return useMemo(
    () =>
      buildForYouFeed(
        {
          ad: { ranked: source?.ads ?? [] },
          product: { ranked: source?.products ?? [] },
          service: { ranked: source?.services ?? [] },
        },
        { limit: target },
      ),
    [source, target],
  );
}

/** Ids of the shelf cards of one type (ads, products or services). */
export function forYouIdsOf(items: readonly ForYouItem[], kind: ForYouItem['kind']): Set<string> {
  const ids = new Set<string>();
  for (const item of items) if (item.kind === kind) ids.add(item.data.id);
  return ids;
}
