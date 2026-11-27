'use client';

import { Suspense, useState } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { ClipboardList } from 'lucide-react';
import type { RequestOfferStatus } from '@/types/request.types';
import { Pagination } from '@/components/shared/ui/Pagination';
import { useMyRequestOffers } from '@/hooks/queries/useRequests';
import { useWithdrawRequestOffer } from '@/hooks/mutations/useRequestMutations';
import { ROUTES } from '@/lib/constants';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { normalizeFilterPage, parseFilterEnum } from '../../../shared/filters';
import { FilterChipGroup } from '@/components/shared/filters/FilterChipGroup';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';
import { RequestOfferCard } from '@/components/requests/RequestOfferCard';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

function MyRequestOffersContent() {
  const filters = useUnifiedFilters({ basePath: ROUTES.myOpenRequestOffers, profile: 'myRequestOffers' });
  const searchParams = filters.params;
  const page = normalizeFilterPage(searchParams.get('page'));
  const status = parseFilterEnum(searchParams.get('status'), ['PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'] as const);
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
          <IntentPrefetchLink href={ROUTES.requests} prefetch={false}>سوق الطلبات</IntentPrefetchLink>
        </Button>
      </div>

      <FilterChipGroup
        label="حالة العرض"
        value={status ?? ''}
        options={[
          { value: '', label: 'الكل' },
          { value: 'PENDING', label: 'قيد الانتظار' },
          { value: 'ACCEPTED', label: 'مقبول' },
          { value: 'DECLINED', label: 'مرفوض' },
          { value: 'WITHDRAWN', label: 'مسحوب' },
        ]}
        onChange={(value) => filters.update('status', value || null, { mode: 'push' })}
        role="tablist"
        className="flex-wrap"
      />

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
              <IntentPrefetchLink href={ROUTES.requests} prefetch={false}>تصفح السوق</IntentPrefetchLink>
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
