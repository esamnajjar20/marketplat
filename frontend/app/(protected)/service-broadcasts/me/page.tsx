'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { useCancelServiceBroadcast } from '@/hooks/mutations/useServiceBroadcastMutations';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';

export default function MyServiceBroadcastsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['service-broadcasts', 'me'],
    queryFn: () => serviceBroadcastsApi.getMyBroadcasts({ limit: 50 }).then((r) => r.data),
  });
  const cancel = useCancelServiceBroadcast();

  const items = data?.data ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">طلباتي في السوق</h1>
          <p className="text-sm text-muted-foreground">
            الطلبات التي نشرتها ومزوّدو الخدمة يقدّمون عليها عروضاً
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={ROUTES.serviceBroadcasts}>السوق</Link>
          </Button>
          <Button asChild size="sm" className="gap-1">
            <Link href={ROUTES.serviceBroadcastNew}>
              <Plus className="h-4 w-4" />
              طلب جديد
            </Link>
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}
      {isError && (
        <div className="py-8 text-center">
          <p className="text-destructive">تعذّر التحميل</p>
          <button type="button" className="text-sm text-primary" onClick={() => refetch()}>
            إعادة المحاولة
          </button>
        </div>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          title="لا طلبات بعد"
          description="انشر طلباً مفتوحاً ليتلقّى عروض أسعار من مزوّدي الخدمة"
          action={
            <Button asChild size="sm">
              <Link href={ROUTES.serviceBroadcastNew}>نشر طلب</Link>
            </Button>
          }
        />
      )}

      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link href={ROUTES.serviceBroadcast(b.id)} className="min-w-0 flex-1 hover:underline">
                <h2 className="text-sm font-semibold">{b.title}</h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.description}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {b.status} · {formatRelativeTime(b.createdAt)}
                  {b.city ? ` · ${b.city}` : ''}
                </p>
              </Link>
              {b.status === 'OPEN' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (typeof window !== 'undefined' && !window.confirm('إلغاء هذا الطلب؟')) return;
                    cancel.mutate(b.id);
                  }}
                >
                  إلغاء
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
