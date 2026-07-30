'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { Pencil, Trash2, Eye, Briefcase, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { useMyServiceListings } from '@/hooks/queries/useServiceListings';
import { useDeleteServiceListing } from '@/hooks/mutations/useServiceListingMutations';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import type { ServiceListingStatus, ServicePricingType } from '@/types/service.types';

const STATUS_LABELS: Record<ServiceListingStatus, string> = {
  ACTIVE: 'نشطة',
  PAUSED: 'متوقفة',
  DELETED: 'محذوفة',
};

function formatServicePrice(pricingType: ServicePricingType, price: string | null): string {
  if (pricingType === 'NEGOTIABLE' || !price) return 'حسب الاتفاق';
  const formatted = formatPrice(price);
  return pricingType === 'STARTING_FROM' ? `يبدأ من ${formatted}` : formatted;
}

export function MyServiceListingsList() {
  const sp = useSearchParams();
  const router = useRouter();
  const page = Number(sp.get('page') ?? 1);
  const status = (sp.get('status') ?? undefined) as ServiceListingStatus | undefined;

  const { data, isLoading, isError, refetch } = useMyServiceListings({ page, limit: 10, status });
  const deleteListing = useDeleteServiceListing();

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  // Same recovery-from-out-of-range-page fix as MyAdsList's own I-09 fix.
  useEffect(() => {
    if (!data) return;
    if (page > totalPages && totalPages >= 1) {
      const params = new URLSearchParams(sp.toString());
      if (totalPages > 1) params.set('page', String(totalPages));
      else params.delete('page');
      router.replace(`${ROUTES.myServices}?${params.toString()}`);
    }
  }, [data, page, totalPages, sp, router]);

  function setStatus(s: string) {
    const params = new URLSearchParams(sp.toString());
    if (s) params.set('status', s); else params.delete('status');
    params.delete('page');
    router.push(`${ROUTES.myServices}?${params.toString()}`);
  }

  const isOutOfRange = !!data && page > totalPages && totalPages >= 1;

  if (isLoading || isOutOfRange) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  // UX-FIX P1-9 (services variant of the MyAdsList fix): a failed fetch
  // must not be misread as "you have no services" — it means we
  // couldn't load them.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل خدماتك</p>
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
      <div className="flex gap-2 border-b pb-3 overflow-x-auto" role="group" aria-label="تصفية الخدمات حسب الحالة">
        {([['', 'الكل'], ['ACTIVE', 'نشطة'], ['PAUSED', 'متوقفة'], ['DELETED', 'محذوفة']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatus(val)}
            aria-pressed={(status ?? '') === val}
            className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors
              ${(status ?? '') === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-10 w-10" />}
          title="لا توجد خدمات"
          description="لم تنشر أي خدمة بعد"
          action={<Link href={ROUTES.services}><Button>نشر خدمة</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((listing) => {
            const thumb = listing.images[0] ? getThumbnailUrl(listing.images[0], 120, 90) : PLACEHOLDER_SVG;
            return (
              <div key={listing.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                <div className="relative w-24 h-18 shrink-0 rounded overflow-hidden bg-muted">
                  <Image src={thumb} alt={listing.title} fill className="object-cover" sizes="96px" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={ROUTES.serviceDetail(listing.id)} className="font-medium text-sm hover:underline line-clamp-1">
                      {listing.title}
                    </Link>
                    <Badge variant={listing.status === 'ACTIVE' ? 'default' : 'secondary'} className="shrink-0 text-xs">
                      {STATUS_LABELS[listing.status]}
                    </Badge>
                  </div>
                  <p className="text-primary font-bold text-sm">
                    {formatServicePrice(listing.pricingType, listing.price)}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{listing.views}</span>
                    <span>{formatRelativeTime(listing.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Link href={ROUTES.myServiceEdit(listing.id)}>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`تعديل ${listing.title}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={`حذف ${listing.title}`}
                    onClick={() => setDeleteTargetId(listing.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.myServices}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="حذف الخدمة؟"
        description="لا يمكن التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="حذف"
        destructive
        isPending={deleteListing.isPending}
        onConfirm={() => {
          if (!deleteTargetId) return;
          deleteListing.mutate(deleteTargetId, { onSuccess: () => setDeleteTargetId(null) });
        }}
      />
    </div>
  );
}
