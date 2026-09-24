'use client';

import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { useMyRequestOffers } from '@/hooks/queries/useRequests';
import { useWithdrawRequestOffer } from '@/hooks/mutations/useRequestMutations';
import { ROUTES } from '@/lib/constants';
import {
  REQUEST_OFFER_STATUS_LABEL,
  REQUEST_OFFER_STATUS_VARIANT,
  REQUEST_TYPE_LABEL,
} from '@/lib/requestStatus';
import { formatRelativeTime } from '@/lib/formatters';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';

export default function MyRequestOffersPage() {
  const { data, isLoading, isError, refetch } = useMyRequestOffers({ limit: 50 });
  const withdraw = useWithdrawRequestOffer();
  const items = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-10" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">عروضي</h1>
          <p className="text-sm text-muted-foreground">العروض التي قدّمتها على طلبات السوق</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.requests}>سوق الطلبات</Link>
        </Button>
      </div>

      {isLoading && <RequestListSkeleton count={4} />}
      {isError && (
        <EmptyState
          title="تعذّر التحميل"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      )}

      {!isLoading && !isError && (
        <ul className="space-y-3">
          {items.map((o) => (
            <li
              key={o.id}
              className="rounded-xl border border-border/80 bg-card p-4 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link href={ROUTES.request(o.requestId)} className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={REQUEST_OFFER_STATUS_VARIANT[o.status]}>
                      {REQUEST_OFFER_STATUS_LABEL[o.status]}
                    </Badge>
                    {o.request?.type && (
                      <span className="text-xs text-muted-foreground">
                        {REQUEST_TYPE_LABEL[o.request.type]}
                      </span>
                    )}
                    {o.createdAt && (
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(o.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="font-semibold leading-snug">
                    {o.request?.title ?? 'طلب'}
                  </p>
                  <p className="text-sm tabular-nums">
                    سعرك: <span className="font-medium">{o.price}</span>
                  </p>
                  {o.message && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{o.message}</p>
                  )}
                </Link>
                {o.status === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={withdraw.isPending}
                    onClick={() => {
                      // SW-FIX-WITHDRAW-CONFIRM: same guard as requests/[id]’s
                      // cancel — withdrawing an offer is irreversible and was
                      // the only destructive action in this app firing on a
                      // single tap without confirmation.
                      if (window.confirm('سحب هذا العرض؟ لن يستطيع العميل رؤيته بعد الآن.')) {
                        withdraw.mutate({ id: o.requestId, offerId: o.id });
                      }
                    }}
                  >
                    سحب
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={<ClipboardList />}
          title="لا عروض بعد"
          description="تصفّح سوق الطلبات وقدّم عرضك على ما يناسبك."
          action={
            <Button asChild>
              <Link href={ROUTES.requests}>تصفح السوق</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
