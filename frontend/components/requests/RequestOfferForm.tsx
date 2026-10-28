'use client';

import { type FormEvent, useState } from 'react';
import {
  useSubmitRequestOffer,
  useWithdrawRequestOffer,
} from '@/hooks/mutations/useRequestMutations';
import type { RequestOfferListItem } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { REQUEST_OFFER_STATUS_LABEL } from '@/lib/requestStatus';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

const MAX_MESSAGE_LENGTH = 1000;

const MESSAGE_TEMPLATES = [
  {
    id: 'ready',
    label: 'جاهز فورًا',
    text: 'يمكنني التنفيذ فورًا. الجودة مضمونة والتواصل مباشر.',
  },
  {
    id: 'days',
    label: 'خلال يومين',
    text: 'أستطيع الإنجاز خلال يومين عمل، مع متابعة حتى التسليم.',
  },
  {
    id: 'visit',
    label: 'معاينة أولاً',
    text: 'أقترح معاينة سريعة ثم تثبيت السعر النهائي حسب الحالة.',
  },
  {
    id: 'include',
    label: 'شامل المواد',
    text: 'السعر يشمل المواد الأساسية والتنفيذ، بدون رسوم مخفية.',
  },
] as const;

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
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  function applyTemplate(id: string, text: string) {
    setMessage(text);
    setActiveTemplate(id);
  }

  const canEdit = !myOffer || myOffer.status === 'PENDING' || myOffer.status === 'WITHDRAWN';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const numericPrice = Number(price);
    if (!canEdit || !Number.isFinite(numericPrice) || numericPrice <= 0) return;
    submit.mutate({
      id: requestId,
      body: { price: numericPrice, message: message.trim() || undefined },
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3.5 rounded-2xl border border-[#EAE3D6] bg-card p-4 shadow-[0_1px_3px_rgba(42,36,29,0.06)]"
      noValidate
    >
      <div>
        <h2 className="text-[15px] font-extrabold">
          {myOffer ? 'تعديل عرضك' : 'قدّم عرضًا'}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
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

      {!canEdit && (
        <div className="rounded-xl border border-[#EBD7A8] bg-[#FBF0D9] px-3 py-2.5 text-xs leading-relaxed text-[#5A3705]">
          ⚠ لا يمكن تعديل هذا العرض لأنه أصبح {REQUEST_OFFER_STATUS_LABEL[myOffer!.status]}. يمكنك متابعة الطلب من حالة العرض الحالية.
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="offer-price" className="text-sm font-medium">
          السعر (₪)
        </label>
        <input
          id="offer-price"
          type="number"
          step="0.01"
          min="0.01"
          required
          disabled={!canEdit}
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
        <div
          className="-mx-0.5 mb-2 flex gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 pb-0.5 scrollbar-none"
          role="group"
          aria-label="قوالب رسالة سريعة"
        >
          {MESSAGE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!canEdit}
              onClick={() => applyTemplate(t.id, t.text)}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-xs font-bold transition-colors',
                activeTemplate === t.id
                  ? 'border-[#397F56] bg-[#E8F1EC] text-[#1F4D33]'
                  : 'border-[#EAE3D6] bg-white text-[#4A433A] hover:border-[#CFE0D5]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          id="offer-msg"
          className="min-h-[96px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed"
          placeholder="تفاصيل العرض، مدة التنفيذ، شروط…"
          value={message}
          disabled={!canEdit}
          onChange={(e) => {
            setMessage(e.target.value);
            setActiveTemplate(null);
          }}
          maxLength={MAX_MESSAGE_LENGTH}
        />
        <p className="text-2xs text-muted-foreground">{message.length}/{MAX_MESSAGE_LENGTH}</p>
      </div>

      {price && (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          معاينة:{' '}
          <span className="font-semibold text-foreground tabular-nums">
            {Number(price).toLocaleString('ar')} ₪
          </span>
          {message.trim() ? ' — مع رسالة مرفقة' : ''}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="min-h-11 flex-1 sm:flex-none"
          disabled={!canEdit || !Number.isFinite(Number(price)) || Number(price) <= 0}
          loading={submit.isPending}
          loadingText="جاري الإرسال…"
        >
          {myOffer ? 'تحديث العرض' : 'إرسال العرض'}
        </Button>
        {myOffer?.status === 'PENDING' && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={withdraw.isPending}
            onClick={() => setConfirmWithdraw(true)}
          >
            سحب عرضي
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmWithdraw}
        onOpenChange={setConfirmWithdraw}
        title="سحب عرضك؟"
        description="سيختفي عرضك من الطلب ويمكنك تقديم عرض جديد لاحقًا إذا بقي الطلب مفتوحًا."
        confirmLabel="سحب العرض"
        destructive
        isPending={withdraw.isPending}
        onConfirm={() => {
          if (!myOffer) return;
          withdraw.mutate(
            { id: requestId, offerId: myOffer.id },
            { onSuccess: () => setConfirmWithdraw(false) },
          );
        }}
      />
    </form>
  );
}
