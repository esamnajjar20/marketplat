/**
 * TRACK-SELLER-RANKING — public leaderboard of sellers.
 *
 * Score (higher is better), deliberately NOT "number of ads only":
 *   trustScore * 2
 * + averageRating * 20
 * + min(totalRatings, 50)          // credibility of the rating
 * + responseRate * 0.3             // 0–100
 * + max(0, 30 - responseTimeHours) // faster reply → more points (cap 30)
 * + accountAgeDays * 0.05          // mild seniority
 * - suspended → excluded
 * - verified → +15
 *
 * Returns top N with rank medals metadata for the frontend.
 */
import { prisma } from '../../config/prisma';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function scoreRow(row: {
  trustScore: number;
  averageRating: { toNumber?: () => number } | number | string;
  totalRatings: number;
  responseRate: { toNumber?: () => number } | number | string | null;
  responseTimeMinutes: number | null;
  verified: boolean;
  joinedSellingAt: Date;
}): number {
  const rating =
    typeof row.averageRating === 'object' && row.averageRating && 'toNumber' in row.averageRating
      ? row.averageRating.toNumber!()
      : Number(row.averageRating);
  const rate =
    row.responseRate == null
      ? 0
      : typeof row.responseRate === 'object' && 'toNumber' in row.responseRate
        ? row.responseRate.toNumber!()
        : Number(row.responseRate);

  const responseTimeHours =
    row.responseTimeMinutes != null ? row.responseTimeMinutes / 60 : 48; // unknown → neutral-slow
  const ageDays = Math.max(
    0,
    (Date.now() - new Date(row.joinedSellingAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  let s = 0;
  s += row.trustScore * 2;
  s += rating * 20;
  s += Math.min(row.totalRatings, 50);
  s += rate * 0.3;
  s += Math.max(0, 30 - responseTimeHours);
  s += ageDays * 0.05;
  if (row.verified) s += 15;
  return Math.round(s * 10) / 10;
}

export const sellersRankingService = {
  getTop: async (limit = DEFAULT_LIMIT) => {
    const take = Math.min(Math.max(1, limit), MAX_LIMIT);

    const rows = await prisma.sellerProfile.findMany({
      where: {
        suspended: false,
        // at least some activity signal
        OR: [{ totalRatings: { gt: 0 } }, { activeAds: { gt: 0 } }, { trustScore: { gt: 0 } }],
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        verified: true,
        trustScore: true,
        averageRating: true,
        totalRatings: true,
        responseRate: true,
        responseTimeMinutes: true,
        activeAds: true,
        joinedSellingAt: true,
        user: { select: { id: true, city: true } },
      },
      take: 200, // pool then sort in JS — ranking formula is app-side
    });

    const ranked = rows
      .map((r) => ({
        sellerProfileId: r.id,
        userId: r.user.id,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        city: r.user.city,
        verified: r.verified,
        trustScore: r.trustScore,
        averageRating: Number(r.averageRating),
        totalRatings: r.totalRatings,
        responseTimeMinutes: r.responseTimeMinutes,
        responseRate: r.responseRate != null ? Number(r.responseRate) : null,
        activeAds: r.activeAds,
        score: scoreRow(r),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, take)
      .map((r, i) => ({
        rank: i + 1,
        medal: i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : null,
        ...r,
      }));

    return ranked;
  },
};
