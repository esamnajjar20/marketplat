'use client';

/**
 * أحدث النشاط — design-matched activity feed for the admin overview.
 * Pulls recent pending reports + pending stores as the most actionable signals.
 */

import Link from 'next/link';
import { Flag, Store, UserCheck, ShoppingBag } from 'lucide-react';
import { useAdminOpsQueue, useAdminReports, useAdminStores } from '@/hooks/queries/useAdmin';
import { adminTabHref } from '@/lib/adminHubTabs';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

type FeedItem = {
  id: string;
  label: string;
  href: string;
  icon: typeof Flag;
  at?: string;
};

export function AdminLatestActivity() {
  const { data: queue } = useAdminOpsQueue();
  const { data: reportsPage, isLoading: loadingReports } = useAdminReports(
    { status: 'PENDING', limit: 3 },
  );
  const { data: storesPage, isLoading: loadingStores } = useAdminStores(
    { status: 'PENDING', page: 1 },
  );

  const isLoading = loadingReports || loadingStores;

  const items: FeedItem[] = [];

  for (const r of reportsPage?.items ?? []) {
    items.push({
      id: `report-${r.id}`,
      label: 'بلاغ جديد على إعلان',
      href: adminTabHref('reports', { status: 'PENDING' }),
      icon: Flag,
      at: r.createdAt,
    });
  }
  for (const s of (storesPage?.items ?? []).slice(0, 2)) {
    items.push({
      id: `store-${s.id}`,
      label: 'متجر جديد بانتظار الموافقة',
      href: adminTabHref('stores', { status: 'PENDING' }),
      icon: Store,
      at: s.createdAt,
    });
  }
  if ((queue?.pendingSellers ?? 0) > 0) {
    items.push({
      id: 'sellers-pending',
      label: 'طلب توثيق بائع',
      href: adminTabHref('sellers', { verification: 'PENDING' }),
      icon: UserCheck,
    });
  }
  if ((queue?.openReports ?? 0) > 0 && items.length < 4) {
    items.push({
      id: 'ads-hint',
      label: 'إعلانات بانتظار المراجعة',
      href: adminTabHref('ads'),
      icon: ShoppingBag,
    });
  }

  return (
    <section className="rounded-[14px] border border-[#EAE3D6] bg-card p-3.5 shadow-[0_1px_3px_rgba(42,36,29,0.05)]">
      <h2 className="text-[15px] font-extrabold">أحدث النشاط</h2>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="sm" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-center text-[13px] text-[#6B6459]">لا يوجد نشاط حديث</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {items.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-[13px] transition-colors hover:bg-[#F6F1E7]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F6F1E7] text-primary">
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                {item.at ? (
                  <span className="shrink-0 text-[12px] text-[#6B6459]">
                    <HydrationSafeRelativeTime date={item.at} />
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
