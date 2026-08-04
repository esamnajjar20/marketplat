'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Eye, CheckCircle } from 'lucide-react';
import { Button }       from '@/components/shared/ui/Button';
import { Badge }        from '@/components/shared/ui/Badge';
import { Pagination }   from '@/components/shared/ui/Pagination';
import { EmptyState }   from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useMyAds }     from '@/hooks/queries/useAds';
import { useDeleteAd, useMarkAsSold } from '@/hooks/mutations/useAdMutations';
import { useOwnedListPage, useOutOfRangeRedirect } from '@/hooks/useOwnedListPage';
import { ROUTES, STATUS_LABELS } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { ShoppingBag, AlertTriangle } from 'lucide-react';
import type { AdStatus } from '@/types/ad.types';

export function MyAdsList() {
  // Page/status logic shared with MyServiceListingsList and
  // MyProductsList — see useOwnedListPage.
  const { page, status, setStatus, searchParams: sp } = useOwnedListPage<AdStatus>(ROUTES.myAds);

  const { data, isLoading, isError, refetch } = useMyAds({ page, limit: 10, status });
  const deleteAd   = useDeleteAd();
  const markAsSold = useMarkAsSold();

  // Tracks which ad the delete-confirmation dialog applies to (null = closed).
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const items      = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Out-of-range-page recovery — shared with MyServiceListingsList and
  // MyProductsList. See useOwnedListPage.ts (was FIX I-09 here originally).
  const isOutOfRange = useOutOfRangeRedirect({
    baseUrl: ROUTES.myAds,
    page,
    totalPages: data?.meta?.totalPages,
    hasData: !!data,
    searchParams: sp,
  });

  if (isLoading || isOutOfRange) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  // UX-FIX P1-9: `items = data?.items ?? []` meant a failed fetch fell
  // straight into the items.length === 0 empty state ("لم تنشر أي
  // إعلانات بعد") — actively misleading for a seller who has real ads
  // but hit a network/server error, since it reads as "your ads are
  // gone" rather than "we couldn't load them". Checked after the
  // isOutOfRange redirect-in-progress case above, since that one still
  // needs `data` to have resolved successfully first.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل إعلاناتك</p>
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

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex gap-2 border-b pb-3 overflow-x-auto" role="group" aria-label="تصفية الإعلانات حسب الحالة">
        {([['', 'الكل'], ['ACTIVE', 'نشطة'], ['SOLD', 'مباعة'], ['DELETED', 'محذوفة']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setStatus(val)}
            aria-pressed={(status ?? '') === val}
            className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors
              ${(status ?? '') === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<ShoppingBag className="h-10 w-10" />}
          title="لا توجد إعلانات"
          description="لم تنشر أي إعلانات بعد"
          action={<Link href={ROUTES.adCreate}><Button>نشر إعلان</Button></Link>} />
      ) : (
        <div className="space-y-3">
          {items.map((ad) => {
            const thumb = ad.images[0] ? getThumbnailUrl(ad.images[0], 120, 90) : PLACEHOLDER_SVG;
            return (
              <div key={ad.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                <div className="relative w-24 h-18 shrink-0 rounded overflow-hidden bg-muted">
                  <Image src={thumb} alt={ad.title} fill className="object-cover" sizes="96px" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={ROUTES.adDetail(ad.id)} className="font-medium text-sm hover:underline line-clamp-1">{ad.title}</Link>
                    <Badge variant={ad.status === 'ACTIVE' ? 'default' : 'secondary'} className="shrink-0 text-xs">
                      {STATUS_LABELS[ad.status]}
                    </Badge>
                  </div>
                  <p className="text-primary font-bold text-sm">{formatPrice(ad.price)}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{ad.views}</span>
                    <span>{formatRelativeTime(ad.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {/* FIX A11Y-01: icon-only action buttons need an
                      accessible name — title alone isn't reliable for
                      screen readers and has no keyboard equivalent. */}
                  {ad.status === 'ACTIVE' && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-success hover:text-success"
                      title="تعليم كمباع" aria-label={`تعليم ${ad.title} كمباع`}
                      disabled={markAsSold.isPending}
                      onClick={() => markAsSold.mutate(ad.id)}>
                      <CheckCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Link href={ROUTES.adEdit(ad.id)}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`تعديل ${ad.title}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={`حذف ${ad.title}`}
                    onClick={() => setDeleteTargetId(ad.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination totalPages={totalPages} currentPage={page}
          baseUrl={ROUTES.myAds} searchParams={Object.fromEntries(sp.entries())} />
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="حذف الإعلان؟"
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف"
        destructive
        isPending={deleteAd.isPending}
        onConfirm={() => {
          if (!deleteTargetId) return;
          // UX-FIX P1-3: close only once the delete actually succeeds
          // (useDeleteAd's own onSuccess still handles the toast +
          // redirect + cache invalidation — this just also closes the
          // dialog so it doesn't linger if navigation is ever delayed).
          deleteAd.mutate(deleteTargetId, { onSuccess: () => setDeleteTargetId(null) });
        }}
      />
    </div>
  );
}
