'use client';

import Link from 'next/link';
import { useMyRequests } from '@/hooks/queries/useRequests';
import { ROUTES } from '@/lib/constants';
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '@/lib/requestStatus';

export default function MyRequestsPage() {
  const { data, isLoading } = useMyRequests({ limit: 50 });
  const items = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
      <h1 className="text-xl font-semibold">طلباتي</h1>
      {isLoading && <p className="text-muted-foreground">جاري التحميل…</p>}
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id} className="rounded-xl border p-4">
            <Link href={ROUTES.request(r.id)} className="block space-y-1">
              <div className="text-xs text-muted-foreground">
                {REQUEST_TYPE_LABEL[r.type]} · {REQUEST_STATUS_LABEL[r.status]}
              </div>
              <h2 className="font-medium">{r.title}</h2>
            </Link>
          </li>
        ))}
      </ul>
      {!isLoading && items.length === 0 && <p className="text-muted-foreground">لا طلبات بعد</p>}
    </div>
  );
}
