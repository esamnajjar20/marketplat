'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { useMyRequestOffers } from '@/hooks/queries/useRequests';
import { useWithdrawRequestOffer } from '@/hooks/mutations/useRequestMutations';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';
import { RequestOfferCard } from '@/components/requests/RequestOfferCard';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

export default function MyRequestOffersPage() {
  const { data, isLoading, isError, refetch } = useMyRequestOffers({ limit: 50 });
  // CONFIRM-OFFERS-01: replace window.confirm with ConfirmDialog for
  // consistent RTL / dark-mode / a11y behaviour across the app.
  const [confirmOffer, setConfirmOffer] = useState<{ id: string; offerId: string } | null>(null);
  const withdraw = useWithdrawRequestOffer();
  const items = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-3 pb-10 sm:px-4 lg:px-0" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">عروضي</h1>
          <p className="text-sm text-muted-foreground">العروض التي قدّمتها على طلبات السوق</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.requests}>سوق الطلبات</Link>
        </Button>
      </div>

      {isLoading && <RequestListSkeleton count={4} />}
      {isError && (
        <EmptyState
          title="تعذّر التحميل"
          action={
            <Button variant="outline" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((o) => (
            <RequestOfferCard
              key={o.id}
              offer={o}
              context="owner"
              action={o.status === 'PENDING' ? (
                <Button size="sm" variant="outline" disabled={withdraw.isPending} onClick={() => setConfirmOffer({ id: o.requestId, offerId: o.id })}>
                  سحب
                </Button>
              ) : undefined}
            />
          ))}
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={<ClipboardList />}
          title="لا عروض بعد"
          description="تصفّح سوق الطلبات وقدّم عرضك على ما يناسبك."
          action={
            <Button asChild>
              <Link href={ROUTES.requests}>تصفح السوق</Link>
            </Button>
          }
        />
      )}

      <ConfirmDialog
        open={confirmOffer !== null}
        onOpenChange={(o) => { if (!o) setConfirmOffer(null); }}
        title="سحب هذا العرض؟"
        description="لن يستطيع العميل رؤيته بعد الآن."
        confirmLabel="سحب العرض"
        destructive
        isPending={withdraw.isPending}
        onConfirm={() => {
          if (!confirmOffer) return;
          withdraw.mutate(confirmOffer, { onSuccess: () => setConfirmOffer(null) });
        }}
      />
    </div>
  );
}
