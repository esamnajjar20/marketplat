'use client';

import { SafeImage } from '@/components/shared/ui/SafeImage';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Star, AlertTriangle } from 'lucide-react';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useSellerRatings } from '@/hooks/queries/useSellerRatings';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatDate } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';

interface Props {
  sellerProfileId: string;
}

/**
 * TRACK-AD-RATINGS-LIST: mirrors StoreReviewsList/ServiceReviewsList's
 * layout exactly — same avatar/name/stars/comment/date card, same
 * loading/error/empty branches, same BUG-09-style namespaced
 * pagination param (see StoreReviewsList's own comment on that fix;
 * this list uses `adRatingsPage` specifically since it renders on the
 * same seller profile page as ServiceReviewsList's bare `page` param
 * — see the page's own comment). The one addition: a small "عن
 * إعلان: {title}" line + link when a rating is scoped to a specific
 * ad (SellerRating.adId/.ad — the one shape difference from
 * StoreReview/ServiceReview, see seller.types.ts's SellerRating
 * comment) — omitted entirely for a rating with no ad attached, since
 * CreateSellerRatingPayload.adId is optional.
 */
export function SellerRatingsList({ sellerProfileId }: Props) {
  const sp = useSearchParams();
  // Namespaced distinctly from ServiceReviewsList's bare `page` param —
  // both lists render on the same seller profile page (see
  // app/(public)/sellers/[id]/page.tsx), so sharing one param would
  // repeat BUG-09's exact bug (see StoreReviewsList's own comment on
  // that fix) where paging one list silently moved the other too.
  const page = Number(sp.get('adRatingsPage') ?? 1);

  const { data, isLoading, isError, refetch } = useSellerRatings(sellerProfileId, { page, limit: 10 });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  if (isLoading) {
    return <div className="flex justify-center py-8"><LoadingSpinner /></div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive text-sm">حدث خطأ أثناء تحميل التقييمات</p>
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
        description="لم يقيّم أحد هذا البائع بعد"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {items.map((rating) => {
          const avatar = getAvatarUrl(rating.rater.avatarUrl ?? '', 40);
          return (
            <div key={rating.id} className="flex gap-3 p-3 rounded-lg border bg-card">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                <SafeImage variant="avatar" src={avatar} alt={rating.rater.name} fill className="object-cover" sizes="40px" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{rating.rater.name}</span>
                  <div className="flex items-center gap-0.5 shrink-0" dir="ltr">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-3.5 w-3.5 ${
                          n <= rating.score ? 'fill-rating text-rating' : 'text-muted-foreground'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {rating.comment && <p className="text-sm text-muted-foreground">{rating.comment}</p>}
                {rating.ad && (
                  <Link
                    href={ROUTES.adDetail(rating.ad.id)}
                    className="block text-xs text-primary hover:underline line-clamp-1"
                  >
                    عن إعلان: {rating.ad.title}
                  </Link>
                )}
                <p className="text-xs text-muted-foreground">{formatDate(rating.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.sellerProfile(sellerProfileId)}
          searchParams={Object.fromEntries(
            Array.from(sp.entries()).filter(([k]) => k !== 'adRatingsPage')
          )}
          pageParam="adRatingsPage"
        />
      )}
    </div>
  );
}
