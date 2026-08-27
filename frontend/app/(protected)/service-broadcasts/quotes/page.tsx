'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { SERVICE_QUOTE_STATUS_LABELS, SERVICE_QUOTE_STATUS_VARIANT } from '@/lib/serviceQuoteStatus';
import { useWithdrawServiceQuote } from '@/hooks/mutations/useServiceBroadcastMutations';
import type { ServiceQuoteListItem } from '@/api/service-broadcasts.api';

function QuoteListItem({ quote }: { quote: ServiceQuoteListItem }) {
  // Hook keyed per-item on its own broadcastId — valid since each list
  // row is its own component instance, not a hook call inside .map's
  // callback on a shared component.
  const withdrawQuote = useWithdrawServiceQuote(quote.broadcastId);

  return (
    <li className="rounded-lg border bg-card p-4 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={ROUTES.serviceBroadcast(quote.broadcastId)}
          className="font-medium text-sm hover:underline"
        >
          {quote.broadcast?.title ?? quote.broadcastId}
        </Link>
        <Badge variant={SERVICE_QUOTE_STATUS_VARIANT[quote.status]}>
          {SERVICE_QUOTE_STATUS_LABELS[quote.status]}
        </Badge>
      </div>
      <p className="text-primary font-bold text-sm">{formatPrice(quote.price)}</p>
      <p className="text-xs text-muted-foreground">{formatRelativeTime(quote.createdAt)}</p>
      {quote.status === 'PENDING' && (
        <Button
          variant="outline"
          size="sm"
          disabled={withdrawQuote.isPending}
          onClick={() => withdrawQuote.mutate(quote.id)}
        >
          {withdrawQuote.isPending ? 'جارٍ السحب…' : 'سحب العرض'}
        </Button>
      )}
    </li>
  );
}

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
          <QuoteListItem key={q.id} quote={q} />
        ))}
      </ul>
    </div>
  );
}
