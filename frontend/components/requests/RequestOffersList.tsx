'use client';

import { useAcceptRequestOffer } from '@/hooks/mutations/useRequestMutations';
import {
  REQUEST_OFFER_STATUS_LABEL,
  REQUEST_OFFER_STATUS_VARIANT,
} from '@/lib/requestStatus';
import type { RequestOfferListItem, RequestStatus } from '@/types/request.types';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { formatRelativeTime } from '@/lib/formatters';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { MessageSquare } from 'lucide-react';

type Props = {
  requestId: string;
  offers: RequestOfferListItem[];
  isOwner: boolean;
  requestStatus: RequestStatus;
  /** When non-owner: backend already filtered — still show section title. */
  hiddenForCompetition?: boolean;
};

export function RequestOffersList({
  requestId,
  offers,
  isOwner,
  requestStatus,
  hiddenForCompetition,
}: Props) {
  const accept = useAcceptRequestOffer();

  if (hiddenForCompetition && offers.length === 0) {
    return (
      <section className="space-y-2 rounded-xl border border-dashed p-4">
        <h2 className="font-semibold">العروض</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          أسعار العروض الأخرى مخفية للحفاظ على نزاهة المنافسة. بعد قبول صاحب
          الطلب لعرض، يُفتح الشات للتنسيق.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">العروض ({offers.length})</h2>

      {offers.length === 0 ? (
        <EmptyState
          compact
          icon={<MessageSquare />}
          title="لا عروض بعد"
          description={
            isOwner
              ? 'انتظر عروض البائعين أو مقدّمي الخدمة على طلبك.'
              : 'كن أول من يقدّم عرضًا.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {offers.map((o) => (
            <li
              key={o.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/80 bg-card p-4"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold tabular-nums">{o.price}</span>
                  <Badge variant={REQUEST_OFFER_STATUS_VARIANT[o.status]}>
                    {REQUEST_OFFER_STATUS_LABEL[o.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {o.offerer?.name ?? 'مستخدم'}
                  {o.createdAt ? ` · ${formatRelativeTime(o.createdAt)}` : ''}
                </p>
                {o.message && (
                  <p className="text-sm leading-relaxed text-foreground/90">{o.message}</p>
                )}
              </div>
              {isOwner && requestStatus === 'OPEN' && o.status === 'PENDING' && (
                <Button
                  size="sm"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate({ id: requestId, offerId: o.id })}
                >
                  قبول العرض
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
