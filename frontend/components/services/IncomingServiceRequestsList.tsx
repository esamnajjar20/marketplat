'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle, Inbox, Check, X, Play, CheckCheck } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useIncomingServiceRequests } from '@/hooks/queries/useServiceRequests';
import { useRespondToServiceRequest } from '@/hooks/mutations/useServiceRequestMutations';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import {
  SERVICE_REQUEST_STATUS_LABELS,
  SERVICE_REQUEST_STATUS_VARIANT,
} from '@/lib/serviceRequestStatus';
import type { ServiceRequestStatus } from '@/types/service.types';

const FILTER_TABS: readonly (ServiceRequestStatus | '')[] = [
  '', 'PENDING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED',
];

/** One request row's action buttons — only the actions legal from its current status (TRANSITION_ACTOR, service-requests.service.ts). */
function RequestActions({ id, status }: { id: string; status: ServiceRequestStatus }) {
  const respond = useRespondToServiceRequest(id);

  if (status === 'PENDING') {
    return (
      <div className="flex gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="gap-1 text-destructive hover:text-destructive"
          disabled={respond.isPending}
          onClick={() => respond.mutate({ action: 'REJECTED' })}
        >
          <X className="h-3.5 w-3.5" />رفض
        </Button>
        <Button
          size="sm"
          className="gap-1"
          disabled={respond.isPending}
          onClick={() => respond.mutate({ action: 'ACCEPTED' })}
        >
          <Check className="h-3.5 w-3.5" />قبول
        </Button>
      </div>
    );
  }

  if (status === 'ACCEPTED') {
    return (
      <Button size="sm" className="gap-1 shrink-0" disabled={respond.isPending} onClick={() => respond.mutate({ action: 'IN_PROGRESS' })}>
        <Play className="h-3.5 w-3.5" />بدء التنفيذ
      </Button>
    );
  }

  if (status === 'IN_PROGRESS') {
    return (
      <Button size="sm" className="gap-1 shrink-0" disabled={respond.isPending} onClick={() => respond.mutate({ action: 'COMPLETED' })}>
        <CheckCheck className="h-3.5 w-3.5" />إنهاء
      </Button>
    );
  }

  return null;
}

/**
 * IncomingServiceRequestsList — provider-side inbox at /my-services/requests.
 * Epic 3.1: the report found zero appointments/requests UI for providers
 * at all; this is the provider counterpart to MyServiceRequestsList,
 * exposing serviceRequestsApi.getIncomingAsProvider + .respond.
 */
export function IncomingServiceRequestsList() {
  const sp = useSearchParams();
  const router = useRouter();
  const page = Number(sp.get('page') ?? 1);
  const status = (sp.get('status') ?? undefined) as ServiceRequestStatus | undefined;

  const { data, isLoading, isError, refetch } = useIncomingServiceRequests({ page, limit: 10, status });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  useEffect(() => {
    if (!data) return;
    if (page > totalPages && totalPages >= 1) {
      const params = new URLSearchParams(sp.toString());
      if (totalPages > 1) params.set('page', String(totalPages));
      else params.delete('page');
      router.replace(`${ROUTES.incomingServiceRequests}?${params.toString()}`);
    }
  }, [data, page, totalPages, sp, router]);

  function setStatus(s: string) {
    const params = new URLSearchParams(sp.toString());
    if (s) params.set('status', s); else params.delete('status');
    params.delete('page');
    router.push(`${ROUTES.incomingServiceRequests}?${params.toString()}`);
  }

  const isOutOfRange = !!data && page > totalPages && totalPages >= 1;

  if (isLoading || isOutOfRange) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  // A 404 here means the caller has no service-provider profile yet
  // (service-requests.service.ts's getMyRequestsAsProvider throws
  // SERVICE_PROVIDER_NOT_FOUND) — distinct from a genuine fetch failure,
  // but both render the same retry affordance; the page around this
  // component is only ever linked to from a provider's own dashboard.
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل الطلبات الواردة</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b pb-3 overflow-x-auto" role="group" aria-label="تصفية الطلبات الواردة حسب الحالة">
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
          icon={<Inbox className="h-10 w-10" />}
          title="لا توجد طلبات واردة"
          description="لم يصلك أي طلب خدمة بعد"
        />
      ) : (
        <div className="space-y-3">
          {items.map((request) => {
            const thumb = request.listing.images[0]
              ? getThumbnailUrl(request.listing.images[0], 120, 90)
              : PLACEHOLDER_SVG;

            return (
              <div key={request.id} className="flex flex-col gap-3 p-3 rounded-lg border bg-card sm:flex-row">
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
                  <p className="text-xs text-muted-foreground">من {request.customer.name}</p>
                  <p className="text-sm line-clamp-2">{request.details}</p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(request.createdAt)}</p>
                </div>
                <div className="flex items-center sm:items-end">
                  <RequestActions id={request.id} status={request.status} />
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
          baseUrl={ROUTES.incomingServiceRequests}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}
    </div>
  );
}
