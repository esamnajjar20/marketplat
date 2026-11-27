'use client';

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { ClipboardList } from 'lucide-react';
import { useMyRequests } from '@/hooks/queries/useRequests';
import { ROUTES } from '@/lib/constants';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { normalizeFilterPage, parseFilterEnum } from '../../../shared/filters';
import { FilterChipGroup } from '@/components/shared/filters/FilterChipGroup';
import type { RequestStatus } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestCard } from '@/components/requests/RequestCard';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';

const STATUS_TABS: Array<{ value?: RequestStatus; label: string }> = [
  { value: undefined, label: 'الكل' },
  { value: 'OPEN', label: 'مفتوح' },
  { value: 'ACCEPTED', label: 'مقبول' },
  { value: 'CANCELLED', label: 'ملغى' },
  { value: 'EXPIRED', label: 'منتهي' },
];

export default function MyRequestsPage() {
  const filters = useUnifiedFilters({ basePath: ROUTES.myOpenRequests, profile: 'myOpenRequests' });
  const searchParams = filters.params;
  const page = normalizeFilterPage(searchParams.get('page'));
  const status = parseFilterEnum(searchParams.get('status'), ['OPEN', 'ACCEPTED', 'CANCELLED', 'EXPIRED'] as const);

  const { data, isLoading, isError, refetch } = useMyRequests({
    page,
    limit: 20,
    status,
  });
  const items = Array.isArray(data?.data) ? data.data : [];
  const totalPages =
    (data as { meta?: { pagination?: { totalPages?: number } } })?.meta?.pagination
      ?.totalPages ?? 1;


  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 pb-0 md:pb-10 sm:space-y-6 sm:px-4 lg:px-0" dir="rtl">
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.07] to-transparent p-4 sm:flex-row sm:items-center sm:p-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">طلباتي</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">الطلبات التي نشرتها في السوق، تابع حالتها وعدّل خياراتك بسهولة.</p>
        </div>
        <Button asChild size="sm" className="min-h-10 w-full sm:w-auto">
          <IntentPrefetchLink href={ROUTES.requestNew} prefetch={false}>طلب جديد</IntentPrefetchLink>
        </Button>
      </div>

      <FilterChipGroup
        label="حالة الطلب"
        value={status ?? ''}
        options={STATUS_TABS.map((tab) => ({ value: tab.value ?? '', label: tab.label }))}
        onChange={(value) => filters.update('status', value || null, { mode: 'push' })}
        className="-mx-1 px-1"
      />

      {isLoading && <RequestListSkeleton />}
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
        <ul className="min-w-0 space-y-3">
          {items.map((r) => (
            <RequestCard key={r.id} request={r} showStatus />
          ))}
        </ul>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={<ClipboardList />}
          title="لا طلبات هنا"
          description="انشر احتياجك ليصل للبائعين ومقدّمي الخدمة."
          action={
            <Button asChild>
              <IntentPrefetchLink href={ROUTES.requestNew} prefetch={false}>نشر طلب</IntentPrefetchLink>
            </Button>
          }
        />
      )}

      <Pagination
        totalPages={Number(totalPages) || 1}
        currentPage={page}
        baseUrl={ROUTES.myOpenRequests}
        searchParams={{ status }}
      />
    </div>
  );
}
