'use client';

import { useAcceptRequestOffer } from '@/hooks/mutations/useRequestMutations';
import type { RequestOfferListItem, RequestStatus } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { MessageSquare } from 'lucide-react';
import { RequestOfferCard } from '@/components/requests/RequestOfferCard';

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {offers.map((o) => (
            <RequestOfferCard
              key={o.id}
              offer={o}
              context={isOwner ? 'owner' : 'public'}
              action={isOwner && requestStatus === 'OPEN' && o.status === 'PENDING' ? (
                <Button size="sm" disabled={accept.isPending} onClick={() => accept.mutate({ id: requestId, offerId: o.id })}>
                  قبول العرض
                </Button>
              ) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
