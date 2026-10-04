'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type { ApiResponse } from '@/types/api.types';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Badge } from '@/components/shared/ui/Badge';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import { ResponseTimeBadge } from '@/components/sellers/ResponseTimeBadge';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

interface RankRow {
  rank: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
  sellerProfileId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  verified: boolean;
  averageRating: number;
  totalRatings: number;
  responseTimeMinutes: number | null;
  score: number;
}

const MEDAL = { gold: '🥇', silver: '🥈', bronze: '🥉' } as const;

export function SellersRankingList({ limit = 20 }: { limit?: number }) {
  const cached = getOfflineList<RankRow>(OFFLINE_LIST_KEYS.sellersRanking);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sellers', 'ranking', limit],
    queryFn: async () => {
      try {
        const rows =
          (await apiClient
            .get<ApiResponse<RankRow[]>>('/sellers/ranking', { params: { limit } })
            .then((r) => r.data.data ?? [])) ?? [];
        saveOfflineList(
          OFFLINE_LIST_KEYS.sellersRanking,
          rows,
          OFFLINE_LIST_LIMITS.sellersRanking,
        );
        return rows;
      } catch (err) {
        const local = getOfflineList<RankRow>(OFFLINE_LIST_KEYS.sellersRanking);
        if (local?.items.length) return local.items;
        throw err;
      }
    },
    ...(cached && cached.items.length > 0
      ? {
          initialData: cached.items,
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        تعذّر تحميل الترتيب.{' '}
        <button type="button" className="inline-flex min-h-10 items-center rounded-lg px-2 text-primary hover:bg-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => refetch()}>
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">لا يوجد بائعون بعد.</p>;
  }

  return (
    <ol className="space-y-2" aria-label="ترتيب أفضل البائعين">
      {rows.map((r) => (
        <li
          key={r.sellerProfileId}
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
        >
          <span className="w-8 text-center text-lg font-bold tabular-nums">
            {r.medal ? MEDAL[r.medal] : r.rank}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={ROUTES.userProfile(r.userId)}
              className="font-medium hover:underline"
            >
              {r.displayName}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {r.verified && <Badge variant="success">موثّق</Badge>}
              {r.city && <span>{r.city}</span>}
              <span>
                ⭐ {r.averageRating.toFixed(1)} ({r.totalRatings})
              </span>
              <ResponseTimeBadge responseTimeMinutes={r.responseTimeMinutes} size="sm" />
            </div>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">نقاط {r.score}</span>
        </li>
      ))}
    </ol>
  );
}
