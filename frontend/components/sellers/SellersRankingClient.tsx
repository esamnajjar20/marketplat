'use client';

import { SellersRankingList } from '@/components/sellers/SellersRankingList';

/**
 * Thin interactive boundary around the ranking list. The route now supplies
 * the first public page through HydrationBoundary, so this component can be
 * server-rendered without disabling SSR; local offline seeding still runs in
 * useEffect and cannot change the hydration render.
 */
export function SellersRankingClient({
  limit,
  persistServerSeed = false,
}: {
  limit: number;
  persistServerSeed?: boolean;
}) {
  return <SellersRankingList limit={limit} persistServerSeed={persistServerSeed} />;
}
