'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle, MessageSquare, X, Star, CheckCheck, ShieldAlert } from 'lucide-react';
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
import { formatPrice } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import {
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_STATUS_VARIANT,
} from '@/lib/serviceRequestStatus';
import type { ServiceRequestStatus } from '@/types/service.types';

const FILTER_TABS: readonly (ServiceRequestStatus | '')[] = [
  '', 'PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'DISPUTED',
];

/**
 * MyServiceRequestsList — customer-side view of /my-requests. Epic 3.1
 * counterpart to MyServiceListingsList; same pagination/filter-tab/
 * out-of-range-page-recovery pattern.
 */
export function MyServiceRequestsList() {
  const sp = useSearchParams();
  const router = useRouter();
  // clamp URL page param to positive integer.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const statusParam = sp.get('status') ?? '';
  const status = FILTER_TABS.includes(statusParam as ServiceRequestStatus | '')
    ? (statusParam || undefined) as ServiceRequestStatus | undefined
    : undefined;

  const { data, isLoading, isError, refetch } = useMyServiceRequests({ page, limit: 10, status });
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; title: string } | null>(null);
  const [completeTargetId, setCompleteTargetId] = useState<string | null>(null);
  const [approveTargetId, setApproveTargetId] = useState<string | null>(null);
  const [disputeTargetId, setDisputeTargetId] = useState<string | null>(null);
  const respond = useRespondToServiceRequest(cancelTargetId ?? '');
  const completeRespond = useRespondToServiceRequest(completeTargetId ?? '');
  const approveRespond = useRespondToServiceRequest(approveTargetId ?? '');
  const disputeRespond = useRespondToServiceRequest(disputeTargetId ?? '');

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
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2" role="group" aria-label="تصفية الطلبات حسب الحالة" style={{ scrollbarWidth: 'thin' }}>
        {FILTER_TABS.map((val) => (
          <button
            key={val}
            onClick={() => setStatus(val)}
            aria-pressed={(status ?? '') === val}
            className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-full px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
              ${(status ?? '') === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
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
              <div key={request.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm transition-shadow hover:shadow-md sm:flex-row">
                <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:h-20 sm:w-24">
                  <SafeImage src={thumb} alt={request.listing.title} fill className="object-cover" sizes="96px" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between">
                    <Link
                      href={ROUTES.serviceDetail(request.listing.id)}
                      className="min-w-0 break-words text-sm font-semibold leading-6 hover:underline sm:line-clamp-1"
                    >
                      {request.listing.title}
                    </Link>
                    <Badge variant={SERVICE_REQUEST_STATUS_VARIANT[request.status]} className="max-w-full shrink-0 text-xs">
                      {SERVICE_REQUEST_STATUS_LABELS[request.status]}
                    </Badge>
                  </div>
                  <p className="break-words text-xs text-muted-foreground">
                    إلى {request.listing.provider.businessName}
                  </p>
                  <p className="text-sm line-clamp-2">{request.details}</p>
                  {(request.agreedPrice ?? request.quotedPrice) && (
                    <p className="text-primary font-bold text-sm">
                      {formatPrice((request.agreedPrice ?? request.quotedPrice)!)}
                      {request.agreedPrice ? '' : ' (سعر مبدئي)'}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{<HydrationSafeRelativeTime date={request.createdAt} />}</p>
                  {/* AUDIT-FIX (issue #6): details/attachedImages were
                      clipped here with no way to see the full request —
                      this links to the new detail page for both. */}
                  <Link href={ROUTES.serviceRequestDetail(request.id)} className="inline-flex min-h-9 items-center text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    عرض التفاصيل الكاملة
                  </Link>
                  {request.status === 'COMPLETED' && !canReview && (
                    <p className="text-xs text-success flex items-center gap-1">
                      <Star className="h-3 w-3 fill-rating text-rating" />تم إرسال تقييمك
                    </p>
                  )}
                  {request.status === 'ACCEPTED' && request.listing.serviceType?.capabilities?.requestQuote && request.quotedPrice != null && request.agreedPrice == null && (
                    <Button
                      size="sm"
                      className="mt-1 gap-1.5"
                      disabled={approveRespond.isPending}
                      onClick={() => setApproveTargetId(request.id)}
                    >
                      <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />موافقة وبدء التنفيذ
                    </Button>
                  )}
                  {(request.status === 'IN_PROGRESS' || request.status === 'COMPLETED') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 gap-1.5 text-destructive hover:text-destructive"
                      disabled={disputeRespond.isPending}
                      onClick={() => setDisputeTargetId(request.id)}
                    >
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />فتح نزاع
                    </Button>
                  )}
                  {request.status === 'IN_PROGRESS' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 gap-1.5"
                      onClick={() => setCompleteTargetId(request.id)}
                    >
                      <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />تأكيد إتمام الخدمة
                    </Button>
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
                  <div className="flex shrink-0 flex-row justify-end gap-1 sm:flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-destructive hover:text-destructive"
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

      <ConfirmDialog
        open={Boolean(disputeTargetId)}
        onOpenChange={(open) => { if (!open) setDisputeTargetId(null); }}
        title="فتح نزاع على الطلب؟"
        description="سيتم إيقاف دورة الطلب حتى يراجعه فريق الإدارة. اذكر المشكلة بوضوح لتسهيل حلها."
        confirmLabel="فتح النزاع"
        destructive
        requireReason
        reasonLabel="سبب النزاع"
        reasonPlaceholder="اشرح المشكلة (10 أحرف على الأقل)…"
        isPending={disputeRespond.isPending}
        onConfirm={() => undefined}
        onConfirmWithReason={(reason) => {
          if (!disputeTargetId) return;
          disputeRespond.mutate({ action: 'DISPUTED', disputeReason: reason }, { onSuccess: () => setDisputeTargetId(null) });
        }}
      />

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.myServiceRequests}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <ConfirmDialog
        open={approveTargetId !== null}
        onOpenChange={(open) => { if (!open) setApproveTargetId(null); }}
        title="اعتماد السعر وبدء التنفيذ؟"
        description="بالموافقة يصبح السعر المعروض هو السعر المتفق عليه ويبدأ تنفيذ الخدمة."
        confirmLabel="موافقة وبدء التنفيذ"
        isPending={approveRespond.isPending}
        onConfirm={() => {
          if (!approveTargetId) return;
          const request = items.find((item) => item.id === approveTargetId);
          if (!request?.quotedPrice) return;
          approveRespond.mutate(
            { action: 'IN_PROGRESS', agreedPrice: Number(request.quotedPrice) },
            { onSuccess: () => setApproveTargetId(null) },
          );
        }}
      />

      <ConfirmDialog
        open={completeTargetId !== null}
        onOpenChange={(open) => { if (!open) setCompleteTargetId(null); }}
        title="تأكيد إتمام الخدمة؟"
        description="سيتم إغلاق الطلب باعتباره مكتملًا، ويمكنك بعد ذلك تقييم الخدمة."
        confirmLabel="تأكيد الإتمام"
        isPending={completeRespond.isPending}
        onConfirm={() => {
          if (!completeTargetId) return;
          completeRespond.mutate({ action: 'COMPLETED' }, { onSuccess: () => setCompleteTargetId(null) });
        }}
      />

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
