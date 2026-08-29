'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';

export default function ServiceBroadcastsFeedPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['service-broadcasts', 'open'],
    queryFn: () => serviceBroadcastsApi.getOpenFeed({ limit: 20 }).then((r) => r.data),
  });

  const items = data?.data ?? [];

  return (
    // FIX DESKTOP-WIDTH-01: see my-reports/page.tsx's matching comment.
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">سوق الطلبات</h1>
          <p className="text-sm text-muted-foreground">
            طلبات مفتوحة من العملاء — قدّم عرض سعر كمزود خدمة
          </p>
        </div>
        <Link href={ROUTES.myServiceBroadcastQuotes}>
          <Button size="sm" variant="outline">
            عروضي
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      )}
      {isError && (
        <div className="text-center py-8">
          <p className="text-destructive">تعذّر التحميل</p>
          <button type="button" className="text-sm text-primary" onClick={() => refetch()}>
            إعادة المحاولة
          </button>
        </div>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState title="لا طلبات مفتوحة حالياً" description="عد لاحقاً أو أنشئ طلبك من حساب عميل" />
      )}
      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b.id}>
            <Link
              href={ROUTES.serviceBroadcast(b.id)}
              className="block rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors"
            >
              <h2 className="font-semibold text-sm">{b.title}</h2>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.description}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {b.city ? `${b.city} · ` : ''}
                {formatRelativeTime(b.createdAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
