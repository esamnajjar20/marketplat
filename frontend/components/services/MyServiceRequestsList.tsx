'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle, MessageSquare, X, Star } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import { ReviewServiceRequestDialog } from '@/components/services/ReviewServiceRequestDialog';
import { useMyServiceRequests } from '@/hooks/queries/useServiceRequests';
import { useRespondToServiceRequest } from '@/hooks/mutations/useServiceRequestMutations';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import {
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_STATUS_VARIANT,
} from '@/lib/serviceRequestStatus';
import type { ServiceRequestStatus } from '@/types/service.types';

const FILTER_TABS: readonly (ServiceRequestStatus | '')[] = [
  '', 'PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED',
];

/**
 * MyServiceRequestsList — customer-side view of /my-requests. Epic 3.1
 * counterpart to MyServiceListingsList; same pagination/filter-tab/
 * out-of-range-page-recovery pattern.
 */
export function MyServiceRequestsList() {
  const sp = useSearchParams();
  const router = useRouter();
  const page = Number(sp.get('page') ?? 1);
  const status = (sp.get('status') ?? undefined) as ServiceRequestStatus | undefined;

  const { data, isLoading, isError, refetch } = useMyServiceRequests({ page, limit: 10, status });
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const respond = useRespondToServiceRequest(cancelTargetId ?? '');
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(null);

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  useEffect(() => {
    if (!data) return;
    if (page > totalPages && totalPages >= 1) {
      const params = new URLSearchParams(sp.toString());
      if (totalPages > 1) params.set('page', String(totalPages));
      else params.delete('page');
      router.replace(`${ROUTES.myServiceRequests}?${params.toString()}`);
    }
  }, [data, page, totalPages, sp, router]);

  function setStatus(s: string) {
    const params = new URLSearchParams(sp.toString());
    if (s) params.set('status', s); else params.delete('status');
    params.delete('page');
    router.push(`${ROUTES.myServiceRequests}?${params.toString()}`);
  }

  const isOutOfRange = !!data && page > totalPages && totalPages >= 1;

  if (isLoading || isOutOfRange) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل طلباتك</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-3 overflow-x-auto" role="group" aria-label="تصفية الطلبات حسب الحالة">
        {FILTER_TABS.map((val) => (
          <button
            key={val}
            onClick={() => setStatus(val)}
            aria-pressed={(status ?? '') === val}
            className={`shrink-0 text-sm px-3 py-1 rounded-full transition-colors
              ${(status ?? '') === val ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
          >
            {val ? SERVICE_REQUEST_STATUS_LABELS[val] : 'الكل'}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10" />}
          title="لا توجد طلبات"
          description="لم ترسل أي طلب خدمة بعد"
          action={<Link href={ROUTES.services}><Button>تصفّح الخدمات</Button></Link>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((request) => {
            const thumb = request.listing.images[0]
              ? getThumbnailUrl(request.listing.images[0], 120, 90)
              : PLACEHOLDER_SVG;
            const canCancel = request.status === 'PENDING' || request.status === 'ACCEPTED' || request.status === 'IN_PROGRESS';
            const canReview = request.status === 'COMPLETED' && request.review === null;

            return (
              <div key={request.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                <div className="relative w-24 h-18 shrink-0 rounded overflow-hidden bg-muted">
                  <Image src={thumb} alt={request.listing.title} fill className="object-cover" sizes="96px" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={ROUTES.serviceDetail(request.listing.id)}
                      className="font-medium text-sm hover:underline line-clamp-1"
                    >
                      {request.listing.title}
                    </Link>
                    <Badge variant={SERVICE_REQUEST_STATUS_VARIANT[request.status]} className="shrink-0 text-xs">
                      {SERVICE_REQUEST_STATUS_LABELS[request.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    إلى {request.listing.provider.businessName}
                  </p>
                  <p className="text-sm line-clamp-2">{request.details}</p>
                  {(request.agreedPrice ?? request.quotedPrice) && (
                    <p className="text-primary font-bold text-sm">
                      {formatPrice((request.agreedPrice ?? request.quotedPrice)!)}
                      {request.agreedPrice ? '' : ' (سعر مبدئي)'}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(request.createdAt)}</p>
                  {/* AUDIT-FIX (issue #6): details/attachedImages were
                      clipped here with no way to see the full request —
                      this links to the new detail page for both. */}
                  <Link href={ROUTES.serviceRequestDetail(request.id)} className="inline-block text-xs text-primary hover:underline">
                    عرض التفاصيل الكاملة
                  </Link>
                  {request.status === 'COMPLETED' && !canReview && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />تم إرسال تقييمك
                    </p>
                  )}
                  {canReview && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 mt-1"
                      onClick={() => setReviewTarget({ id: request.id, title: request.listing.title })}
                    >
                      <Star className="h-3.5 w-3.5" />قيّم الخدمة
                    </Button>
                  )}
                </div>
                {canCancel && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`إلغاء طلب ${request.listing.title}`}
                      title="إلغاء الطلب"
                      onClick={() => setCancelTargetId(request.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.myServiceRequests}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={cancelTargetId !== null}
        onOpenChange={(open) => { if (!open) setCancelTargetId(null); }}
        title="إلغاء الطلب؟"
        description="لن تتمكن من التراجع عن هذا الإجراء بعد التأكيد."
        confirmLabel="إلغاء الطلب"
        destructive
        isPending={respond.isPending}
        onConfirm={() => {
          if (!cancelTargetId) return;
          respond.mutate({ action: 'CANCELLED' }, { onSuccess: () => setCancelTargetId(null) });
        }}
      />

      {reviewTarget && (
        <ReviewServiceRequestDialog
          requestId={reviewTarget.id}
          listingTitle={reviewTarget.title}
          open={reviewTarget !== null}
          onOpenChange={(open) => { if (!open) setReviewTarget(null); }}
        />
      )}
    </div>
  );
}
