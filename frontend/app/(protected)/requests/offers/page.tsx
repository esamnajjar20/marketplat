'use client';

import Link from 'next/link';
import { useMyRequestOffers } from '@/hooks/queries/useRequests';
import { ROUTES } from '@/lib/constants';
import { REQUEST_OFFER_STATUS_LABEL } from '@/lib/requestStatus';

export default function MyRequestOffersPage() {
  const { data, isLoading } = useMyRequestOffers({ limit: 50 });
  const items = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
      <h1 className="text-xl font-semibold">عروضي على الطلبات</h1>
      {isLoading && <p className="text-muted-foreground">جاري التحميل…</p>}
      <ul className="space-y-3">
        {items.map((o) => (
          <li key={o.id} className="rounded-xl border p-4">
            <Link href={ROUTES.request(o.requestId)} className="block space-y-1">
              <div className="text-xs text-muted-foreground">{REQUEST_OFFER_STATUS_LABEL[o.status]}</div>
              <p className="font-medium">{o.price}</p>
              {o.message && <p className="text-sm text-muted-foreground">{o.message}</p>}
            </Link>
          </li>
        ))}
      </ul>
      {!isLoading && items.length === 0 && <p className="text-muted-foreground">لا عروض بعد</p>}
    </div>
  );
}
