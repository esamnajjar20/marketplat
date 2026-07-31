'use client';

import Link from 'next/link';
import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState }    from '@/components/shared/feedback/EmptyState';
import { Pagination }    from '@/components/shared/ui/Pagination';
import { useFavorites }  from '@/hooks/queries/useFavorites';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useSearchParams } from 'next/navigation';
import { Heart, AlertTriangle } from 'lucide-react';
import { Button }        from '@/components/shared/ui/Button';
import { ROUTES }        from '@/lib/constants';

export function FavoritesList() {
  const sp   = useSearchParams();
  const page = Number(sp.get('page') ?? 1);
  const { data, isLoading, isError, refetch } = useFavorites({ page });

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  // UX-FIX P1-8: `items = data?.items ?? []` meant a failed fetch fell
  // straight into the items.length === 0 branch below and showed "لا
  // توجد إعلانات محفوظة" (no favorites) — misleading for a user who
  // genuinely has saved ads but hit a network/server error. isError is
  // checked first so a real fetch failure can never be misread as an
  // empty list.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل المفضلة</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={<Heart className="h-10 w-10" />}
        title="لا توجد إعلانات محفوظة"
        description="احفظ الإعلانات التي تعجبك لتجدها هنا لاحقاً"
        action={<Link href={ROUTES.home}><Button variant="outline">تصفح الإعلانات</Button></Link>} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((fav) => (
          // EPIC 1.4: a favorited ad that was later deleted by its
          // owner (or an admin) still comes back from GET /favorites —
          // the backend never filters DELETED out, it just reports the
          // real status (favorites.repository.ts's favoriteListSelect
          // already selects `status`). Until now, AdCard only
          // special-cased SOLD, so clicking a deleted favorite silently
          // 404'd with no warning. DeletedFavoriteCard below renders a
          // clearly-disabled card with an explicit "remove from
          // favorites" action instead of a live link.
          fav.ad.status === 'DELETED'
            ? <DeletedFavoriteCard key={fav.ad.id} adId={fav.ad.id} title={fav.ad.title} />
            : <AdCard key={fav.ad.id} ad={fav.ad} />
        ))}
      </div>
      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page} baseUrl="/favorites" />
      )}
    </div>
  );
}

/**
 * EPIC 1.4: non-navigable placeholder for a favorited ad whose owner
 * (or an admin) deleted it. Deliberately not a <Link> — the ad detail
 * page for a DELETED ad genuinely 404s (see ads.service.ts), so a
 * clickable card here would just move the surprise from "silent 404
 * after a click" to "a click that looks live but goes nowhere useful."
 * Shows a clear reason and a direct way to clean it up from the list.
 */
function DeletedFavoriteCard({ adId, title }: { adId: string; title: string }) {
  const toggleFavorite = useToggleFavorite();

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-dashed bg-muted/30 opacity-75">
      <div className="flex aspect-[4/3] items-center justify-center bg-muted">
        <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
          تم حذف الإعلان
        </span>
      </div>
      <div className="space-y-2 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-muted-foreground">
          {title}
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={toggleFavorite.isPending}
          onClick={() => toggleFavorite.mutate(adId)}
        >
          {toggleFavorite.isPending ? 'جارٍ الإزالة…' : 'إزالة من المفضلة'}
        </Button>
      </div>
    </div>
  );
}
