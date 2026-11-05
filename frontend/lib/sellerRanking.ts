import type { SellerRankingRow } from '@/types/seller-ranking.types';

/** Normalize display labels once for both SSR and the client fallback query. */
export function normalizeSellerRankingRows(
  rows: readonly SellerRankingRow[],
): SellerRankingRow[] {
  return rows.map((row) => ({
    ...row,
    displayName: typeof row.displayName === 'string' && row.displayName.trim()
      ? row.displayName.trim()
      : `بائع ${row.rank}`,
  }));
}
