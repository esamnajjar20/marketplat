// FIX OPS-QUEUE-FIX-01: shared ApiError + deduplicated icon className
// (was "h-4.5 w-4.5 h-4 w-4" -- Tailwind kept only the last pair).
'use client';

import Link from 'next/link';
import { Flag, Store, UserCheck, ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAdminOpsQueue } from '@/hooks/queries/useAdmin';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { adminTabHref } from '@/lib/adminHubTabs';
import { formatNumber } from '@/lib/formatters';
import { ApiError } from '@/components/shared/ApiError';
import { parseApiError } from '@/lib/errorParser';
import { cn } from '@/lib/utils';

type QueueKey = 'openReports' | 'pendingStores' | 'pendingSellers' | 'unreviewedFraud';

const ITEMS: {
  key: QueueKey;
  label: string;
  hint: string;
  href: string;
  icon: typeof Flag;
  accent: string;
}[] = [
  {
    key: 'openReports',
    label: 'بلاغات مفتوحة',
    hint: 'بانتظار المراجعة',
    href: adminTabHref('reports', { status: 'PENDING' }),
    icon: Flag,
    accent: 'text-destructive bg-destructive/10',
  },
  {
    key: 'pendingStores',
    label: 'متاجر معلّقة',
    hint: 'بانتظار الموافقة',
    href: adminTabHref('stores', { status: 'PENDING' }),
    icon: Store,
    accent: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
  },
  {
    key: 'pendingSellers',
    label: 'بائعون للتحقق',
    hint: 'طلب توثيق معلّق',
    href: adminTabHref('sellers', { verification: 'PENDING' }),
    icon: UserCheck,
    accent: 'text-primary bg-primary/10',
  },
  {
    key: 'unreviewedFraud',
    label: 'إشارات احتيال',
    hint: 'لم تُراجع بعد',
    href: adminTabHref('fraud', { reviewed: 'false' }),
    icon: ShieldAlert,
    accent: 'text-orange-600 bg-orange-500/10 dark:text-orange-400',
  },
];

export function AdminOpsQueue() {
  const { data, isLoading, isError, error, refetch } = useAdminOpsQueue();

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-xl border py-10">
        <LoadingSpinner />
      </div>
    );
  }

  // FIX OPS-QUEUE-FIX-01: shared ApiError instead of a hand-rolled
  // AlertTriangle + bare <button>.
  if (isError || !data) {
    return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  }

  const total = data.total ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold tracking-tight">طابور العمل</h2>
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? 'لا عناصر تحتاج إجراء الآن'
              : `${formatNumber(total)} عنصر يحتاج مراجعة`}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map(({ key, label, hint, href, icon: Icon, accent }) => {
          const count = data[key] ?? 0;
          const hasWork = count > 0;
          return (
            <Link
              key={key}
              href={href}
              className={cn(
                'group flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors',
                'hover:border-primary/40 hover:bg-muted/30',
                hasWork && 'border-primary/20',
              )}
            >
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', accent)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{label}</p>
                  <span
                    className={cn(
                      'tabular-nums text-lg font-bold',
                      hasWork ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {formatNumber(count)}
                  </span>
                </div>
                <p className="mt-0.5 text-2xs-tight text-muted-foreground">{hint}</p>
                <p className="mt-2 flex items-center gap-1 text-2xs-tight font-medium text-primary opacity-80 group-hover:opacity-100">
                  عرض
                  <ArrowLeft className="h-3 w-3" />
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
