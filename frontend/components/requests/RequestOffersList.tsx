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
      <section className="space-y-2 rounded-2xl border border-[#EAE3D6] bg-card p-4 shadow-[0_1px_3px_rgba(42,36,29,0.06)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-extrabold">العروض ({totalOffersCount})</h2>
          <span className="text-xs font-medium text-[#6B6459]">الأسعار الأخرى مخفية</span>
        </div>
        <p className="text-[13px] leading-relaxed text-[#4A433A]">
          توجد عروض على هذا الطلب، لكن أسعار العروض الأخرى مخفية للحفاظ على نزاهة المنافسة.
          يمكنك تقديم عرضك دون معرفة أسعار المنافسين.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold">العروض ({totalOffersCount})</h2>
        {hiddenForCompetition && (
          <span className="text-xs text-[#6B6459]">الأسعار الأخرى مخفية</span>
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
                <Button size="sm" className="h-10 w-full rounded-xl font-bold" disabled={accept.isPending} onClick={() => accept.mutate({ id: requestId, offerId: o.id })}>
                  ✓ قبول العرض
                </Button>
              ) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
