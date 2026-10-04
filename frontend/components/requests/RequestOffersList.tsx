'use client';

import { useAcceptRequestOffer } from '@/hooks/mutations/useRequestMutations';
import type { RequestOfferListItem, RequestStatus } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { MessageSquare } from 'lucide-react';
import { formatOffersCount } from '@/lib/requestStatus';
import { RequestOfferCard } from '@/components/requests/RequestOfferCard';

type Props = {
  requestId: string;
  offers: RequestOfferListItem[];
  isOwner: boolean;
  requestStatus: RequestStatus;
  /** When non-owner: backend already filtered — still show section title. */
  hiddenForCompetition?: boolean;
  totalOffersCount?: number;
};

export function RequestOffersList({
  requestId,
  offers,
  isOwner,
  requestStatus,
  hiddenForCompetition,
  totalOffersCount = offers.length,
}: Props) {
  const accept = useAcceptRequestOffer();

  if (hiddenForCompetition && offers.length === 0) {
    return (
      <section className="space-y-2 rounded-xl border border-dashed p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">العروض</h2>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">{formatOffersCount(totalOffersCount)}</span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          توجد عروض على هذا الطلب، لكن أسعار العروض الأخرى مخفية للحفاظ على نزاهة المنافسة.
          {offers.length > 0 ? ' يظهر لك عرضك فقط.' : ' يمكنك تقديم عرضك دون معرفة أسعار المنافسين.'}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">العروض ({totalOffersCount})</h2>
        {hiddenForCompetition && (
          <span className="text-xs text-muted-foreground">الأسعار الأخرى مخفية</span>
        )}
      </div>

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
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
