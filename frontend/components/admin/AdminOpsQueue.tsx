'use client';

// Design-aligned: matches the "طابور العمل" cards from the admin design HTML.
// Number + icon on top row, label, hint, and outlined "عرض" button.

import Link from 'next/link';
import { Flag, Store, UserCheck, ShieldAlert } from 'lucide-react';
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
}[] = [
  {
    key: 'openReports',
    label: 'بلاغات مفتوحة',
    hint: 'بانتظار المراجعة',
    href: adminTabHref('reports', { status: 'PENDING' }),
    icon: Flag,
  },
  {
    key: 'pendingStores',
    label: 'متاجر معلّقة',
    hint: 'بانتظار الموافقة',
    href: adminTabHref('stores', { status: 'PENDING' }),
    icon: Store,
  },
  {
    key: 'pendingSellers',
    label: 'بائعون للتحقق',
    hint: 'طلب توثيق معلّق',
    href: adminTabHref('sellers', { verification: 'PENDING' }),
    icon: UserCheck,
  },
  {
    key: 'unreviewedFraud',
    label: 'إشارات احتيال',
    hint: 'لم تُراجع بعد',
    href: adminTabHref('fraud', { reviewed: 'false' }),
    icon: ShieldAlert,
  },
];

export function AdminOpsQueue() {
  const { data, isLoading, isError, error, refetch } = useAdminOpsQueue();

  if (isLoading) {
    return (
      <div className="flex justify-center rounded-[14px] border border-[#EAE3D6] bg-card py-10">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !data) {
    return <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />;
  }

  const total = data.total ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-extrabold tracking-tight">طابور العمل</h2>
        {total > 0 && (
          <span className="inline-flex h-[22px] items-center rounded-full bg-[#FBF0D9] px-2 text-[11px] font-bold text-[#7A4B07]">
            {formatNumber(total)} عنصر يحتاج مراجعة
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map(({ key, label, hint, href, icon: Icon }) => {
          const count = data[key] ?? 0;
          return (
            <div
              key={key}
              className="flex flex-col rounded-[14px] border border-[#EAE3D6] bg-[#FBF9F4] p-3 shadow-[0_1px_3px_rgba(42,36,29,0.05)]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-primary">
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="text-[22px] font-extrabold tabular-nums leading-none">
                  {formatNumber(count)}
                </span>
              </div>
              <p className="mt-2 text-[13px] font-bold">{label}</p>
              <p className="mt-0.5 text-[12px] text-[#6B6459]">{hint}</p>
              <Link
                href={href}
                className={cn(
                  'mt-2 inline-flex h-[30px] w-fit items-center justify-center rounded-lg border border-[#CFE0D5] bg-white px-2.5 text-[12px] font-bold text-[#1F4D33]',
                  'hover:bg-primary-soft transition-colors',
                )}
              >
                عرض
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
