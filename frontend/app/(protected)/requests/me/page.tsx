'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMyRequests } from '@/hooks/queries/useRequests';
import { ROUTES } from '@/lib/constants';
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { Button } from '@/components/shared/ui/Button';

export default function MyRequestsPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const statusParam = searchParams.get('status') ?? undefined;

  const { data, isLoading } = useMyRequests({ page, limit: 20, status: statusParam as never });
  const items = Array.isArray(data?.data) ? data.data : [];
  const totalPages =
    (data as { meta?: { pagination?: { totalPages?: number } } })?.meta?.pagination?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">طلباتي</h1>
        <Button asChild size="sm">
          <Link href={ROUTES.requestNew}>طلب جديد</Link>
        </Button>
      </div>
      {isLoading && <p className="text-muted-foreground">جاري التحميل…</p>}
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.id} className="rounded-xl border p-4">
            <Link href={ROUTES.request(r.id)} className="block space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={r.status === 'OPEN' ? 'default' : 'secondary'}>
                  {REQUEST_STATUS_LABEL[r.status]}
                </Badge>
                <span className="text-muted-foreground">{REQUEST_TYPE_LABEL[r.type]}</span>
                {typeof r._count?.offers === 'number' && (
                  <span className="text-muted-foreground">{r._count.offers} عروض</span>
                )}
              </div>
              <h2 className="font-medium">{r.title}</h2>
              <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
            </Link>
          </li>
        ))}
      </ul>
      {!isLoading && items.length === 0 && <p className="text-muted-foreground">لا طلبات بعد</p>}
      <Pagination
        totalPages={Number(totalPages) || 1}
        currentPage={page}
        baseUrl={ROUTES.myRequests}
        searchParams={{ status: statusParam }}
      />
    </div>
  );
}
