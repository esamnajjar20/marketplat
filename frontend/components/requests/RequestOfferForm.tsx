'use client';

import { type FormEvent, useState } from 'react';
import {
  useSubmitRequestOffer,
  useWithdrawRequestOffer,
} from '@/hooks/mutations/useRequestMutations';
import type { RequestOfferListItem } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { REQUEST_OFFER_STATUS_LABEL } from '@/lib/requestStatus';

type Props = {
  requestId: string;
  myOffer?: RequestOfferListItem | null;
};

export function RequestOfferForm({ requestId, myOffer }: Props) {
  const submit = useSubmitRequestOffer();
  const withdraw = useWithdrawRequestOffer();
  const [price, setPrice] = useState(
    myOffer?.price != null ? String(myOffer.price) : '',
  );
  const [message, setMessage] = useState(myOffer?.message ?? '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!price) return;
    submit.mutate({
      id: requestId,
      body: { price: Number(price), message: message.trim() || undefined },
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs"
      noValidate
    >
      <div>
        <h2 className="text-base font-semibold">
          {myOffer ? 'تعديل عرضك' : 'قدّم عرضًا'}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          للخدمات يلزم ملف مقدّم خدمة. للمنتج أو الإيجار يلزم ملف بائع.
          {myOffer && (
            <>
              {' '}
              حالتك الحالية:{' '}
              <span className="font-medium text-foreground">
                {REQUEST_OFFER_STATUS_LABEL[myOffer.status]}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="offer-price" className="text-sm font-medium">
          السعر
        </label>
        <input
          id="offer-price"
          type="number"
          step="0.01"
          min="0"
          required
          inputMode="decimal"
          className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
          placeholder="0.00"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="offer-msg" className="text-sm font-medium">
          رسالة (اختياري)
        </label>
        <textarea
          id="offer-msg"
          className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="تفاصيل العرض، مدة التنفيذ، شروط…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11 flex-1 sm:flex-none" disabled={submit.isPending || !price}>
          {submit.isPending ? 'جاري الإرسال…' : myOffer ? 'تحديث العرض' : 'إرسال العرض'}
        </Button>
        {myOffer?.status === 'PENDING' && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate({ id: requestId, offerId: myOffer.id })}
          >
            سحب عرضي
          </Button>
        )}
      </div>
    </form>
  );
}
