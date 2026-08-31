'use client';

/**
 * Main dashboard metrics — ads + messages only.
 * Store/service KPIs live on their analytics pages; actionable items on SellerTodayTasks + hubs.
 */

import Link from 'next/link';
import {
  Eye,
  Heart,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  Store,
  Wrench,
} from 'lucide-react';
import { useMyAdStats } from '@/hooks/queries/useAds';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { useMyStore } from '@/hooks/queries/useStores';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { formatNumber } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

type StatItem = {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href?: string;
  highlight?: boolean;
};

export function DashboardStats() {
  const { data: stats, isLoading, isError, refetch } = useMyAdStats();
  const { data: convData, isLoading: convLoading } = useMyConversations({ limit: 20 });
  const { data: myStore, isSuccess: storeOk } = useMyStore();
  const { data: myProvider, isSuccess: providerOk } = useMyServiceProvider();

  if (isLoading || convLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card py-8 text-center shadow-xs">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل الإحصائيات</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = convData?.items ?? [];
  const unreadThreads = items.filter((c) => (c.unreadCount ?? 0) > 0).length;

  const adItems: StatItem[] = [
    {
      label: 'الإعلانات النشطة',
      value: stats?.activeAds ?? 0,
      icon: ShoppingBag,
      color: 'text-primary',
      href: ROUTES.myAds,
    },
    {
      label: 'إعلانات تم بيعها',
      value: stats?.soldAds ?? 0,
      icon: TrendingUp,
      color: 'text-success',
      href: ROUTES.myAds,
    },
    {
      label: 'إجمالي المشاهدات',
      value: stats?.totalViews ?? 0,
      icon: Eye,
      color: 'text-accent',
      href: ROUTES.myAds,
    },
    {
      label: 'المفضلة',
      value: stats?.favoritesCount ?? 0,
      icon: Heart,
      color: 'text-destructive',
      href: ROUTES.favorites,
    },
    {
      label: 'محادثات غير مقروءة',
      value: unreadThreads,
      icon: MessageSquare,
      color: 'text-primary',
      href: ROUTES.messages,
      highlight: unreadThreads > 0,
    },
  ];

  return (
    <div className="space-y-4">
      <section aria-label="إحصائيات الإعلانات والرسائل" className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">ملخص سريع</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {adItems.map(({ label, value, icon: Icon, color, href, highlight }) => {
            const inner = (
              <>
                <Icon className={cn('h-5 w-5', color)} />
                <p className="text-2xl font-bold tabular-nums">{formatNumber(value)}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </>
            );
            const className = cn(
              'rounded-xl border border-border bg-card p-4 space-y-2 shadow-xs transition-all',
              highlight && 'border-primary/35 bg-primary-soft',
              href && 'hover:border-primary/25 hover:shadow-sm',
            );
            return href ? (
              <Link key={label} href={href} className={className}>
                {inner}
              </Link>
            ) : (
              <div key={label} className={className}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {(storeOk && myStore) || (providerOk && myProvider) ? (
        <section
          aria-label="اختصارات التشغيل"
          className="flex flex-wrap gap-2 text-sm"
        >
          {storeOk && myStore && (
            <Link
              href={ROUTES.myStore}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm shadow-xs transition-colors hover:bg-muted/50"
            >
              <Store className="h-3.5 w-3.5" />
              لوحة المتجر
            </Link>
          )}
          {storeOk && myStore && (
            <Link
              href={ROUTES.myStoreAnalytics}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted/50"
            >
              إحصائيات المتجر
            </Link>
          )}
          {providerOk && myProvider && (
            <Link
              href={ROUTES.myServices}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm shadow-xs transition-colors hover:bg-muted/50"
            >
              <Wrench className="h-3.5 w-3.5" />
              لوحة الخدمات
            </Link>
          )}
          {providerOk && myProvider && (
            <Link
              href={ROUTES.myServiceProviderAnalytics}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted/50"
            >
              إحصائيات الخدمات
            </Link>
          )}
        </section>
      ) : null}
    </div>
  );
}
