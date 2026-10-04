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
    <div className="mx-auto max-w-3xl space-y-5 p-4 pb-10" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">طلباتي</h1>
          <p className="text-sm text-muted-foreground">الطلبات التي نشرتها في السوق</p>
        </div>
        <Button asChild size="sm">
          <Link href={ROUTES.requestNew}>طلب جديد</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="حالة الطلب" aria-orientation="horizontal">
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
                'inline-flex min-h-10 items-center rounded-full px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
        <ul className="space-y-3">
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
