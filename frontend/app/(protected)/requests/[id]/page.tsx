'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useRequestDetail } from '@/hooks/queries/useRequests';
import {
  useAcceptRequestOffer,
  useCancelRequest,
  useSubmitRequestOffer,
  useWithdrawRequestOffer,
} from '@/hooks/mutations/useRequestMutations';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { REQUEST_OFFER_STATUS_LABEL } from '@/lib/requestStatus';
import { Button } from '@/components/shared/ui/Button';

export default function RequestDetailPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const { data: request, isLoading, isError } = useRequestDetail(id);
  const user = useAuthStore(selectUser);
  const cancel = useCancelRequest();
  const submit = useSubmitRequestOffer();
  const withdraw = useWithdrawRequestOffer();
  const accept = useAcceptRequestOffer();
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');

  if (isLoading) {
    return (
      <p className="p-4 text-muted-foreground" dir="rtl">
        جاري التحميل…
      </p>
    );
  }
  if (isError || !request) {
    return (
      <p className="p-4 text-destructive" dir="rtl">
        الطلب غير موجود
      </p>
    );
  }

  const isOwner = user?.id === request.customerId;
  const myOffer = request.offers?.find((o) => o.offererUserId === user?.id);
  const images = request.attachedImages ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4" dir="rtl">
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          
          {request.city ? ` · ${request.city}` : ''}
        </div>
        <h1 className="text-2xl font-semibold">{request.title}</h1>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{request.description}</p>
        {(request.budgetMin || request.budgetMax) && (
          <p className="text-sm text-muted-foreground">
            الميزانية: {request.budgetMin ?? '—'} – {request.budgetMax ?? '—'}
          </p>
        )}
        {request.expiresAt && (
          <p className="text-xs text-muted-foreground">
            ينتهي: {new Date(request.expiresAt).toLocaleDateString('ar')}
          </p>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" className="h-28 w-full rounded-lg object-cover" />
          ))}
        </div>
      )}

      {isOwner && request.status === 'OPEN' && (
        <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(id)}>
          إلغاء الطلب
        </Button>
      )}

      {!isOwner && request.status === 'OPEN' && (
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!price) return;
            submit.mutate({ id, body: { price: Number(price), message: message || undefined } });
          }}
        >
          <h2 className="font-medium">{myOffer ? 'تعديل عرضك' : 'قدّم عرضًا'}</h2>
          <p className="text-xs text-muted-foreground">
            للخدمات يلزم ملف مقدّم خدمة. للمنتج/الإيجار يلزم ملف بائع.
          </p>
          <input
            type="number"
            step="0.01"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="السعر"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <textarea
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="رسالة (اختياري)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submit.isPending}>
              إرسال العرض
            </Button>
            {myOffer?.status === 'PENDING' && (
              <Button
                type="button"
                variant="outline"
                disabled={withdraw.isPending}
                onClick={() => withdraw.mutate({ id, offerId: myOffer.id })}
              >
                سحب عرضي
              </Button>
            )}
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">العروض ({request.offers?.length ?? 0})</h2>
        <ul className="space-y-2">
          {(request.offers ?? []).map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{o.price}</p>
                <p className="text-xs text-muted-foreground">
                  {o.offerer?.name ?? o.offererUserId} · {REQUEST_OFFER_STATUS_LABEL[o.status]}
                </p>
                {o.message && <p className="text-sm">{o.message}</p>}
              </div>
              {isOwner && request.status === 'OPEN' && o.status === 'PENDING' && (
                <Button
                  size="sm"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate({ id, offerId: o.id })}
                >
                  قبول
                </Button>
              )}
            </li>
          ))}
        </ul>
        {(request.offers?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">لا عروض بعد</p>
        )}
      </section>
    </div>
  );
}
