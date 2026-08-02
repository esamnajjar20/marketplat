'use client';

/**
 * ServiceRequestDetailPage — audit report issue #6 (🟡 medium).
 *
 * GET /service-requests/:id, its API client method, and the
 * useServiceRequest(id) hook all existed fully, but no page used any
 * of them. The practical gap this left: both MyServiceRequestsList
 * (customer) and IncomingServiceRequestsList (provider) render
 * `request.details` clipped to `line-clamp-2` and never render
 * `attachedImages` at all — a customer's full request text and
 * photos were unreachable once the list row truncated them.
 *
 * This page is the missing detail view for both sides of a request.
 * service-requests.service.ts's getById already restricts access to
 * the request's own customer or provider (ForbiddenError otherwise),
 * so no extra ownership check is needed here beyond surfacing that
 * error — same pattern as my-services/[id]/edit's isError → notFound().
 */
import { use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ApiError } from '@/components/shared/ApiError';
import { useServiceRequest } from '@/hooks/queries/useServiceRequests';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatDateTime } from '@/lib/formatters';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { parseApiError } from '@/lib/errorParser';
import {
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_STATUS_VARIANT,
} from '@/lib/serviceRequestStatus';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ServiceRequestDetailPage({ params }: Props) {
  const { id } = use(params);
  const { data: request, isLoading, isError, error, refetch } = useServiceRequest(id);
  const currentUser = useAuthStore(selectUser);

  if (isLoading) {
    return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  }

  if (isError) {
    const parsed = parseApiError(error);
    // 404/403 both mean "not reachable to this viewer" — not-your-request
    // and doesn't-exist should look the same from the outside, same
    // reasoning as edit pages that redirect on a failed ownership check.
    // A 403 here means "not your request", not "no admin permission",
    // so it deliberately stays a hidden 404 rather than ApiError's more
    // explicit Forbidden screen (which would leak that the record exists).
    if (parsed.statusCode === 404 || parsed.statusCode === 403) return notFound();
    // AUDIT-FIX (issue #13): ApiError existed fully (401/403/404/500+
    // dispatch, retry button, page/inline variants) but was unused
    // anywhere in the app — every error state was hand-rolled instead.
    // This is that component's first real usage, for the one status
    // range (500+) it doesn't need to be overridden for above.
    return <ApiError error={parsed} onRetry={() => refetch()} variant="inline" />;
  }

  if (!request) return notFound();

  // Whether the viewer is the request's provider (vs. its customer)
  // decides which list "رجوع" points back to — same two entry points
  // this page is linked from.
  const isProvider = currentUser?.id === request.listing.provider.sellerProfile.userId;
  const backHref = isProvider ? ROUTES.incomingServiceRequests : ROUTES.myServiceRequests;

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" />رجوع
      </Link>

      <div className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded bg-muted">
              <Image
                src={request.listing.images[0] ? getThumbnailUrl(request.listing.images[0], 160, 120) : PLACEHOLDER_SVG}
                alt={request.listing.title}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
            <div>
              <Link href={ROUTES.serviceDetail(request.listing.id)} className="font-semibold hover:underline">
                {request.listing.title}
              </Link>
              <p className="text-sm text-muted-foreground">
                {isProvider ? `من ${request.customer.name}` : `إلى ${request.listing.provider.businessName}`}
              </p>
            </div>
          </div>
          <Badge variant={SERVICE_REQUEST_STATUS_VARIANT[request.status]}>
            {SERVICE_REQUEST_STATUS_LABELS[request.status]}
          </Badge>
        </div>

        <div className="space-y-1">
          <h2 className="text-sm font-medium text-muted-foreground">تفاصيل الطلب</h2>
          <p className="whitespace-pre-wrap text-sm">{request.details}</p>
        </div>

        {request.attachedImages.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">الصور المرفقة</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {request.attachedImages.map((url, i) => (
                <a key={url} href={getDetailImageUrl(url)} target="_blank" rel="noopener noreferrer"
                  className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  <Image src={getThumbnailUrl(url, 200, 200)} alt={`صورة مرفقة ${i + 1}`} fill className="object-cover" sizes="150px" />
                </a>
              ))}
            </div>
          </div>
        )}

        {(request.agreedPrice ?? request.quotedPrice) && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">السعر</h2>
            <p className="text-lg font-bold text-primary">
              {formatPrice((request.agreedPrice ?? request.quotedPrice)!)}
              {request.agreedPrice ? '' : ' (سعر مبدئي)'}
            </p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
          <div>
            <dt className="text-muted-foreground">تاريخ الطلب</dt>
            <dd>{formatDateTime(request.createdAt)}</dd>
          </div>
          {request.respondedAt && (
            <div>
              <dt className="text-muted-foreground">تاريخ الرد</dt>
              <dd>{formatDateTime(request.respondedAt)}</dd>
            </div>
          )}
        </dl>

        {request.review && (
          <p className="text-xs text-muted-foreground">تم إرسال تقييم لهذا الطلب.</p>
        )}
      </div>

      {/* Status changes, cancel, review, and appointment actions stay in
          their respective list rows (MyServiceRequestsList /
          IncomingServiceRequestsList) — this page is the read-only
          detail view; duplicating those mutations here would mean two
          places doing the same status transition. */}
      <Button asChild variant="outline" size="sm">
        <Link href={backHref}>عرض كل الطلبات</Link>
      </Button>
    </div>
  );
}
