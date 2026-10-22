'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RequestOfferStatus } from '@/types/request.types';
import { Pagination } from '@/components/shared/ui/Pagination';
import { useMyRequestOffers } from '@/hooks/queries/useRequests';
import { useWithdrawRequestOffer } from '@/hooks/mutations/useRequestMutations';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';
import { RequestOfferCard } from '@/components/requests/RequestOfferCard';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

function MyRequestOffersContent() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const rawStatus = searchParams.get('status');
  const status: RequestOfferStatus | undefined =
    rawStatus === 'PENDING' || rawStatus === 'ACCEPTED' || rawStatus === 'DECLINED' || rawStatus === 'WITHDRAWN'
      ? rawStatus
      : undefined;
  const { data, isLoading, isError, refetch } = useMyRequestOffers({ page, limit: 20, status });
  // CONFIRM-OFFERS-01: replace window.confirm with ConfirmDialog for
  // consistent RTL / dark-mode / a11y behaviour across the app.
  const [confirmOffer, setConfirmOffer] = useState<{ id: string; offerId: string } | null>(null);
  const withdraw = useWithdrawRequestOffer();
  const items = Array.isArray(data?.data) ? data.data : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-10" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">عروضي</h1>
          <p className="text-sm text-muted-foreground">العروض التي قدّمتها على طلبات السوق</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.requests}>سوق الطلبات</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="حالة العرض">
        {[
          { value: undefined, label: 'الكل' },
          { value: 'PENDING' as const, label: 'قيد الانتظار' },
          { value: 'ACCEPTED' as const, label: 'مقبول' },
          { value: 'DECLINED' as const, label: 'مرفوض' },
          { value: 'WITHDRAWN' as const, label: 'مسحوب' },
        ].map((tab) => {
          const active = tab.value === status;
          const qs = new URLSearchParams();
          if (tab.value) qs.set('status', tab.value);
          const href = qs.toString() ? `${ROUTES.myOpenRequestOffers}?${qs}` : ROUTES.myOpenRequestOffers;
          return (
            <Link
              key={tab.label}
              href={href}
              role="tab"
              aria-selected={active}
              className={cn(
                'inline-flex min-h-10 items-center rounded-full px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
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

      {!isLoading && !isError && (
        <Pagination
          totalPages={Number((data as { meta?: { pagination?: { totalPages?: number } } } | undefined)?.meta?.pagination?.totalPages) || 1}
          currentPage={page}
          baseUrl={ROUTES.myOpenRequestOffers}
          searchParams={{ status }}
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

export default function MyRequestOffersPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl p-4" dir="rtl">جاري تحميل العروض…</div>}>
      <MyRequestOffersContent />
    </Suspense>
  );
}
