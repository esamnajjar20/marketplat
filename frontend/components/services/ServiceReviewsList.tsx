'use client';

import Image from 'next/image';
import { useSearchParams, usePathname } from 'next/navigation';
import { Star, AlertTriangle } from 'lucide-react';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useServiceReviewsForSeller } from '@/hooks/queries/useServiceReviews';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatDate } from '@/lib/formatters';

interface Props {
  sellerProfileId: string;
}

/**
 * ServiceReviewsList — Epic 3.2/3.3. Was previously a fully-built API
 * client (serviceReviewsApi.getForSeller) with zero UI consumers.
 * Rendered on the public seller profile page, below SellerProfileAds.
 * SellerProfileAds has no pagination of its own (no `page` param used
 * there), so this can use the standard `page` param like every other
 * list without colliding with it.
 */
export function ServiceReviewsList({ sellerProfileId }: Props) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const page = Number(sp.get('page') ?? 1);

  const { data, isLoading, isError, refetch } = useServiceReviewsForSeller(sellerProfileId, {
    page,
    limit: 10,
  });

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
        description="لم يقيّم أحد خدمات هذا البائع بعد"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {items.map((review) => {
          const avatar = getAvatarUrl(review.rater.avatarUrl ?? '', 40);
          return (
            <div key={review.id} className="flex gap-3 p-3 rounded-lg border bg-card">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted shrink-0">
                <Image src={avatar} alt={review.rater.name} fill className="object-cover" sizes="40px" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{review.rater.name}</span>
                  <div className="flex items-center gap-0.5 shrink-0" dir="ltr">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-3.5 w-3.5 ${
                          n <= review.score ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}
                <p className="text-xs text-muted-foreground">{formatDate(review.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={pathname}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}
    </div>
  );
}
