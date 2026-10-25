'use client';

import dynamic from 'next/dynamic';

const RankingList = dynamic(
  () => import('@/components/sellers/SellersRankingList').then((module) => module.SellersRankingList),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center py-10" role="status" aria-live="polite">
        <span className="text-sm text-muted-foreground">جارٍ تحميل ترتيب البائعين…</span>
      </div>
    ),
  },
);

/**
 * The ranking depends on browser-persisted offline cache state. Rendering it
 * on the server can produce a loading placeholder while the first client
 * render immediately seeds cached rows, triggering React hydration error #418.
 * Keep the data-dependent list behind a stable client boundary.
 */
export function SellersRankingClient({ limit }: { limit: number }) {
  return <RankingList limit={limit} />;
}
