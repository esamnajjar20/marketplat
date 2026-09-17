'use client';

import Link from 'next/link';
import { useMyRequestOffers } from '@/hooks/queries/useRequests';
import { useWithdrawRequestOffer } from '@/hooks/mutations/useRequestMutations';
import { ROUTES } from '@/lib/constants';
import { REQUEST_OFFER_STATUS_LABEL, REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';

export default function MyRequestOffersPage() {
  const { data, isLoading } = useMyRequestOffers({ limit: 50 });
  const withdraw = useWithdrawRequestOffer();
  const items = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
      <h1 className="text-xl font-semibold">عروضي على الطلبات</h1>
      {isLoading && <p className="text-muted-foreground">جاري التحميل…</p>}
      <ul className="space-y-3">
        {items.map((o) => (
          <li key={o.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={ROUTES.request(o.requestId)} className="block min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={o.status === 'PENDING' ? 'default' : 'secondary'}>
                    {REQUEST_OFFER_STATUS_LABEL[o.status]}
                  </Badge>
                  {o.request?.type && <span>{REQUEST_TYPE_LABEL[o.request.type]}</span>}
                </div>
                <p className="font-medium">{o.request?.title ?? 'طلب'}</p>
                <p className="text-sm">السعر: {o.price}</p>
                {o.message && <p className="text-sm text-muted-foreground">{o.message}</p>}
              </Link>
              {o.status === 'PENDING' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={withdraw.isPending}
                  onClick={() => withdraw.mutate({ id: o.requestId, offerId: o.id })}
                >
                  سحب العرض
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!isLoading && items.length === 0 && <p className="text-muted-foreground">لا عروض بعد</p>}
    </div>
  );
}
