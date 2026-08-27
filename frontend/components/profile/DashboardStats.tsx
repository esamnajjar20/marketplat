'use client';

/**
 * Unified dashboard metrics — ads + optional store + optional service provider.
 */

import Link from 'next/link';
import {
  Eye,
  Heart,
  ShoppingBag,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  Package,
  Users,
  Store,
  Wrench,
  Inbox,
  CalendarClock,
} from 'lucide-react';
import { useMyAdStats } from '@/hooks/queries/useAds';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { useMyStoreAnalytics } from '@/hooks/queries/useStores';
import { useMyServiceProviderAnalytics } from '@/hooks/queries/useServiceProviders';
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
  const {
    data: storeAnalytics,
    isSuccess: storeOk,
  } = useMyStoreAnalytics();
  const {
    data: serviceAnalytics,
    isSuccess: serviceOk,
  } = useMyServiceProviderAnalytics();

  if (isLoading || convLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center rounded-lg border">
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

  const storeItems: StatItem[] =
    storeOk && storeAnalytics
      ? [
          {
            label: 'مشاهدات المتجر',
            value: storeAnalytics.views,
            icon: Store,
            color: 'text-primary',
            href: ROUTES.myStoreAnalytics,
          },
          {
            label: 'المتابعون',
            value: storeAnalytics.followers,
            icon: Users,
            color: 'text-accent',
            href: ROUTES.myStoreAnalytics,
          },
          {
            label: 'منتجات نشطة',
            value: storeAnalytics.activeProducts,
            icon: Package,
            color: 'text-success',
            href: ROUTES.myStoreProducts,
          },
        ]
      : [];

  const serviceItems: StatItem[] =
    serviceOk && serviceAnalytics
      ? [
          {
            label: 'خدمات نشطة',
            value: serviceAnalytics.activeListings,
            icon: Wrench,
            color: 'text-primary',
            href: ROUTES.myServices,
          },
          {
            label: 'طلبات معلّقة',
            value: serviceAnalytics.pendingRequests,
            icon: Inbox,
            color: 'text-accent',
            href: ROUTES.incomingServiceRequests,
            highlight: serviceAnalytics.pendingRequests > 0,
          },
          {
            label: 'مواعيد قادمة',
            value: serviceAnalytics.upcomingAppointments,
            icon: CalendarClock,
            color: 'text-success',
            href: ROUTES.myServiceAppointments,
            highlight: serviceAnalytics.upcomingAppointments > 0,
          },
          {
            label: 'طلبات مكتملة',
            value: serviceAnalytics.completedRequests,
            icon: TrendingUp,
            color: 'text-muted-foreground',
            href: ROUTES.myServiceProviderAnalytics,
          },
        ]
      : [];

  function renderGrid(list: StatItem[]) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {list.map(({ label, value, icon: Icon, color, href, highlight }) => {
          const inner = (
            <>
              <Icon className={cn('h-5 w-5', color)} />
              <p className="text-2xl font-bold tabular-nums">{formatNumber(value)}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </>
          );
          const className = cn(
            'rounded-lg border bg-card p-4 space-y-2 transition-colors',
            highlight && 'border-primary/30 bg-primary/5',
            href && 'hover:bg-muted/50',
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
    );
  }

  return (
    <div className="space-y-4">
      <section aria-label="إحصائيات الإعلانات والرسائل" className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">ملخص سريع</h2>
        {renderGrid(adItems)}
      </section>
      {storeItems.length > 0 && (
        <section aria-label="إحصائيات المتجر" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">المتجر</h2>
            <Link href={ROUTES.myStoreAnalytics} className="text-xs text-primary hover:underline">
              التفاصيل
            </Link>
          </div>
          {renderGrid(storeItems)}
        </section>
      )}
      {serviceItems.length > 0 && (
        <section aria-label="إحصائيات الخدمات" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">الخدمات</h2>
            <Link
              href={ROUTES.myServiceProviderAnalytics}
              className="text-xs text-primary hover:underline"
            >
              التفاصيل
            </Link>
          </div>
          {renderGrid(serviceItems)}
        </section>
      )}
    </div>
  );
}
