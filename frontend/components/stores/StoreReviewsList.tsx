'use client';

import { SafeImage } from '@/components/shared/ui/SafeImage';
import { useSearchParams } from 'next/navigation';
import { Star, AlertTriangle } from 'lucide-react';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useStoreReviews } from '@/hooks/queries/useStoreReviews';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatDate } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface Props {
  storeId: string;
  averageRating?: number | string | null;
  totalRatings?: number | null;
}

/** Reviews list — layout aligned with design mockup «المتجر — التقييمات». */
export function StoreReviewsList({ storeId, averageRating, totalRatings }: Props) {
  const sp = useSearchParams();
  const rawPage = Number(sp.get('reviewsPage') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const { data, isLoading, isError, refetch } = useStoreReviews(storeId, { page, limit: 10 });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const rating = typeof averageRating === 'string' ? parseFloat(averageRating) : averageRating;
  const hasSummary = Number.isFinite(rating) && (totalRatings ?? 0) > 0;

  const scoreCounts: number[] = [0, 0, 0, 0, 0];
  for (const r of items) {
    const s = Math.min(5, Math.max(1, Math.round(r.score)));
    const idx = s - 1;
    if (idx >= 0 && idx < 5) {
      scoreCounts[idx] = (scoreCounts[idx] ?? 0) + 1;
    }
  }
  const maxCount = Math.max(1, ...scoreCounts);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-destructive">حدث خطأ أثناء تحميل التقييمات</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Star className="h-8 w-8" />}
        title="لا توجد تقييمات بعد"
        description="لم يقيّم أحد هذا المتجر بعد"
      />
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {hasSummary && (
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = scoreCounts[star - 1] ?? 0;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={star} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-4 tabular-nums">{star}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#D9962B]"
                        style={{ width: `${Math.max(count > 0 ? 8 : 0, pct)}%` }}
                      />
                    </div>
                    <span className="w-6 text-end tabular-nums">{count || ''}</span>
                  </div>
                );
              })}
            </div>
            <div className="shrink-0 text-center">
              <p className="text-3xl font-extrabold tabular-nums leading-none">{Number(rating).toFixed(1)}</p>
              <div className="mt-1 flex items-center justify-center gap-0.5" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      'h-3.5 w-3.5',
                      n <= Math.round(Number(rating)) ? 'fill-[#D9962B] text-[#D9962B]' : 'text-muted-foreground/40',
                    )}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{(totalRatings ?? 0).toLocaleString('ar')} تقييم</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold">آراء الزبائن</h3>
      </div>

      <div className="space-y-2.5">
        {items.map((review) => {
          const avatar = getAvatarUrl(review.rater.avatarUrl ?? '', 40);
          const initial = (review.rater.name?.trim()?.[0] || 'ز').toUpperCase();
          return (
            <div key={review.id} className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-extrabold text-primary">
                  {review.rater.avatarUrl ? (
                    <SafeImage
                      variant="avatar"
                      src={avatar}
                      alt={review.rater.name}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  ) : (
                    <span aria-hidden>{initial}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">{review.rater.name}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(review.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5" dir="ltr">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn(
                            'h-3.5 w-3.5',
                            n <= review.score ? 'fill-[#D9962B] text-[#D9962B]' : 'text-muted-foreground/35',
                          )}
                        />
                      ))}
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-[13px] leading-relaxed text-foreground/90">{review.comment}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.storeDetail(storeId)}
          searchParams={Object.fromEntries(Array.from(sp.entries()).filter(([k]) => k !== 'reviewsPage'))}
          pageParam="reviewsPage"
        />
      )}
    </div>
  );
}
