'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';

export default function MyServiceQuotesPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['service-broadcasts', 'my-quotes'],
    queryFn: () => serviceBroadcastsApi.getMyQuotes({ limit: 30 }).then((r) => r.data),
  });

  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">عروضي على سوق الطلبات</h1>
      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}
      {isError && (
        <button type="button" className="text-sm text-primary" onClick={() => refetch()}>
          تعذّر التحميل — إعادة المحاولة
        </button>
      )}
      {!isLoading && items.length === 0 && (
        <EmptyState
          title="لا عروض بعد"
          description="تصفح سوق الطلبات وقدّم عرض سعر"
          action={
            <Link href={ROUTES.serviceBroadcasts} className="text-sm text-primary hover:underline">
              سوق الطلبات
            </Link>
          }
        />
      )}
      <ul className="space-y-3">
        {items.map((q) => (
          <li key={q.id} className="rounded-lg border bg-card p-4 space-y-1">
            <Link
              href={ROUTES.serviceBroadcast(q.broadcastId)}
              className="font-medium text-sm hover:underline"
            >
              {q.broadcast?.title ?? q.broadcastId}
            </Link>
            <p className="text-primary font-bold text-sm">{formatPrice(q.price)}</p>
            <p className="text-xs text-muted-foreground">
              {q.status} · {formatRelativeTime(q.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
