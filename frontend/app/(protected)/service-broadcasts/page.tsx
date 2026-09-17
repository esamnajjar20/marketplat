'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">سوق الخدمات (قديم)</h1>
          <p className="text-sm text-muted-foreground">
            عملاء ينشرون احتياجهم — مزوّدو الخدمة يقدّمون عروض أسعار
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" className="gap-1">
            <Link href={ROUTES.serviceBroadcastNew}>
              <Plus className="h-4 w-4" />
              أنشر طلبك
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={ROUTES.myServiceBroadcasts}>طلباتي</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={ROUTES.myServiceBroadcastQuotes}>عروضي</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <p className="font-medium">عميل؟</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          اكتب ما تحتاجه واحصل على عروض من أكثر من مزوّد ثم اختر الأنسب.
        </p>
        <Button asChild size="sm" className="mt-2">
          <Link href={ROUTES.serviceBroadcastNew}>نشر طلب خدمة</Link>
        </Button>
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
          title="لا طلبات مفتوحة حالياً"
          description="كن أول من ينشر طلباً — أو عد لاحقاً كمزوّد خدمة"
          action={
            <Button asChild size="sm">
              <Link href={ROUTES.serviceBroadcastNew}>أنشر طلباً</Link>
            </Button>
          }
        />
      )}
      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b.id}>
            <Link
              href={ROUTES.serviceBroadcast(b.id)}
              className="block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
            >
              <h2 className="text-sm font-semibold">{b.title}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
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
