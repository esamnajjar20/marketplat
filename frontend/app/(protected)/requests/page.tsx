'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useOpenRequests } from '@/hooks/queries/useRequests';
import { ROUTES } from '@/lib/constants';
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import type { RequestType } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';

export default function OpenRequestsPage() {
  const [type, setType] = useState<RequestType | undefined>(undefined);
  const { data, isLoading, isError } = useOpenRequests({ type, limit: 20 });
  const items = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">الطلبات المفتوحة</h1>
        <Button asChild>
          <Link href={ROUTES.requestNew}>طلب جديد</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant={type === undefined ? 'default' : 'outline'} size="sm" onClick={() => setType(undefined)}>
          الكل
        </Button>
        {(['SERVICE', 'PRODUCT', 'RENTAL'] as RequestType[]).map((t) => (
          <Button key={t} variant={type === t ? 'default' : 'outline'} size="sm" onClick={() => setType(t)}>
            {REQUEST_TYPE_LABEL[t]}
          </Button>
        ))}
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.myRequests}>طلباتي</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.myRequestOffers}>عروضي</Link>
        </Button>
      </div>
      {isLoading && <p className="text-muted-foreground">جاري التحميل…</p>}
      {isError && <p className="text-destructive">تعذّر تحميل الطلبات</p>}
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id} className="rounded-xl border p-4">
            <Link href={ROUTES.request(r.id)} className="block space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{REQUEST_TYPE_LABEL[r.type]}</span>
                <span>·</span>
                <span>{REQUEST_STATUS_LABEL[r.status]}</span>
                {r.city && (
                  <>
                    <span>·</span>
                    <span>{r.city}</span>
                  </>
                )}
              </div>
              <h2 className="font-medium">{r.title}</h2>
              <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
            </Link>
          </li>
        ))}
      </ul>
      {!isLoading && items.length === 0 && (
        <p className="text-center text-muted-foreground">لا توجد طلبات مفتوحة حاليًا</p>
      )}
    </div>
  );
}
