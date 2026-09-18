'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { useOpenRequests } from '@/hooks/queries/useRequests';
import { ROUTES } from '@/lib/constants';
import type { RequestType } from '@/types/request.types';
import { Button } from '@/components/shared/ui/Button';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { RequestCard } from '@/components/requests/RequestCard';
import { RequestFilters } from '@/components/requests/RequestFilters';
import { RequestListSkeleton } from '@/components/requests/RequestListSkeleton';
import { ListDataStatus } from '@/components/shared/feedback/ListDataStatus';

export default function OpenRequestsPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const typeParam = searchParams.get('type');
  const type =
    typeParam === 'SERVICE' || typeParam === 'PRODUCT' || typeParam === 'RENTAL'
      ? (typeParam as RequestType)
      : undefined;
  const city = searchParams.get('city') || undefined;
  const q = searchParams.get('q') || undefined;

  const { data, isLoading, isFetching, isError, refetch } = useOpenRequests({
    type,
    city,
    q,
    page,
    limit: 20,
  });
  const items = Array.isArray(data?.data) ? data.data : [];
  const meta = (data as { meta?: { pagination?: { totalPages?: number }; totalPages?: number } } | undefined)?.meta;
  const totalPages = meta?.pagination?.totalPages ?? meta?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 pb-24 sm:space-y-5 sm:p-4 sm:pb-10" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">سوق الطلبات</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          تصفّح ما يبحث عنه الناس وقدّم عرضك. لنشر احتياجك استخدم زر «أضف».
        </p>
      </header>

      <RequestFilters type={type} city={city} q={q} />

      <div className="flex flex-wrap gap-2 text-sm">
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.myRequests}>طلباتي</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={ROUTES.myRequestOffers}>عروضي</Link>
        </Button>
      </div>

      {isLoading && !data && <RequestListSkeleton />}
      <ListDataStatus isFetching={isFetching} hasData={Boolean(data)} />
      {isError && (
        <EmptyState
          title="تعذّر التحميل"
          description="تحقق من الاتصال ثم أعد المحاولة."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      )}

      {(data || !isLoading) && !isError && (
        <ul className="space-y-3">
          {items.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </ul>
      )}

      {(data || !isLoading) && !isError && items.length === 0 && (
        <EmptyState
          icon={<ClipboardList />}
          title="لا طلبات مطابقة"
          description="غيّر الفلاتر أو انشر أول طلب من زر الإضافة أسفل الشاشة."
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
        baseUrl={ROUTES.requests}
        searchParams={{ type, city, q }}
      />
    </div>
  );
}
