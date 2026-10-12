'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { useMyRequests } from '@/hooks/queries/useRequests';
import { ROUTES } from '@/lib/constants';
import type { RequestStatus } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestCard } from '@/components/requests/RequestCard';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';
import { cn } from '@/lib/utils';

const STATUS_TABS: Array<{ value?: RequestStatus; label: string }> = [
  { value: undefined, label: 'الكل' },
  { value: 'OPEN', label: 'مفتوح' },
  { value: 'ACCEPTED', label: 'مقبول' },
  { value: 'CANCELLED', label: 'ملغى' },
  { value: 'EXPIRED', label: 'منتهي' },
];

export default function MyRequestsPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const statusParam = searchParams.get('status');
  const status =
    statusParam === 'OPEN' ||
    statusParam === 'ACCEPTED' ||
    statusParam === 'CANCELLED' ||
    statusParam === 'EXPIRED'
      ? (statusParam as RequestStatus)
      : undefined;

  const { data, isLoading, isError, refetch } = useMyRequests({
    page,
    limit: 20,
    status,
  });
  const items = Array.isArray(data?.data) ? data.data : [];
  const totalPages =
    (data as { meta?: { pagination?: { totalPages?: number } } })?.meta?.pagination
      ?.totalPages ?? 1;

  function statusHref(s?: RequestStatus) {
    const p = new URLSearchParams();
    if (s) p.set('status', s);
    p.set('page', '1');
    const qs = p.toString();
    return qs ? `${ROUTES.myOpenRequests}?${qs}` : ROUTES.myOpenRequests;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:space-y-6 sm:px-4 sm:pb-10 lg:px-0" dir="rtl">
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.07] to-transparent p-4 sm:flex-row sm:items-center sm:p-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">طلباتي</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">الطلبات التي نشرتها في السوق، تابع حالتها وعدّل خياراتك بسهولة.</p>
        </div>
        <Button asChild size="sm" className="min-h-10 w-full sm:w-auto">
          <Link href={ROUTES.requestNew}>طلب جديد</Link>
        </Button>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1" role="tablist" aria-label="حالة الطلب" aria-orientation="horizontal" style={{ scrollbarWidth: 'thin' }}>
        {STATUS_TABS.map((tab) => {
          const active = tab.value === status;
          return (
            <Link
              key={tab.label}
              href={statusHref(tab.value)}
              role="tab"
              aria-selected={active}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 shrink-0 items-center rounded-full px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

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
              <Link href={ROUTES.requestNew}>نشر طلب</Link>
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
