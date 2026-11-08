'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import {
  Megaphone,
  ShoppingBag,
  Wrench,
  Store,
  MessageSquare,
  ClipboardList,
  CalendarCheck,
  User,
  AlertTriangle,
} from 'lucide-react';
import { useDashboardOverview } from '@/hooks/queries/useActivity';
import { ROUTES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import type { UserActivity } from '@/types/activity.types';

function iconFor(type: UserActivity['type']) {
  if (type.startsWith('AD_')) return Megaphone;
  if (type.startsWith('PRODUCT_')) return ShoppingBag;
  if (type.startsWith('SERVICE_') && !type.startsWith('SERVICE_REQUEST')) return Wrench;
  if (type.startsWith('STORE_') || type.startsWith('FAVORITE_')) return Store;
  if (type === 'MESSAGE_SENT') return MessageSquare;
  if (type.startsWith('SERVICE_REQUEST_')) return ClipboardList;
  if (type.startsWith('APPOINTMENT_')) return CalendarCheck;
  return User;
}

function linkFor(activity: UserActivity): string | null {
  if (!activity.entityId) return null;
  switch (activity.entityType) {
    case 'AD':
      return ROUTES.adDetail(activity.entityId);
    case 'STORE':
      return ROUTES.storeDetail(activity.entityId);
    case 'CONVERSATION':
      return ROUTES.conversationDetail(activity.entityId);
    case 'SERVICE_REQUEST':
      return ROUTES.serviceRequestDetail(activity.entityId);
    case 'PRODUCT':
      return ROUTES.productDetail(activity.entityId);
    default:
      return null;
  }
}

/** Dashboard strip — real UserActivity rows, not "last 5 ads". */
export function RecentActivityFeed() {
  const { data: overview, isLoading, isError, refetch } = useDashboardOverview();
  const data = overview?.activity;
  const activityError = isError || Boolean(overview?.activityError);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (activityError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center text-sm">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل النشاط الأخير</p>
        <button type="button" onClick={() => refetch()} className="text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-[14px] border border-[var(--legacy-border)] bg-card px-4 py-8 text-center">
        <p className="text-[15px] font-extrabold">لا يوجد نشاط بعد</p>
        <p className="mt-1 text-[13px] text-[var(--legacy-muted-text)]">ستظهر هنا كل الأنشطة المرتبطة بحسابك</p>
        <IntentPrefetchLink href={ROUTES.adCreate} className="mt-3 inline-flex h-9 items-center rounded-full bg-[var(--legacy-primary)] px-4 text-[13px] font-bold text-primary-foreground" prefetch={false}>
          انشر أول إعلان
        </IntentPrefetchLink>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((activity) => {
        const Icon = iconFor(activity.type);
        const href = linkFor(activity);
        const body = (
          <>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--legacy-primary-soft)]">
              <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-extrabold text-foreground">{activity.title}</p>
              <p className="truncate text-[12px] text-[var(--legacy-muted-text)]">
                {activity.description ? `${activity.description} · ` : ''}
                {<HydrationSafeRelativeTime date={activity.createdAt} />}
              </p>
            </div>
          </>
        );

        return href ? (
          <IntentPrefetchLink
            key={activity.id}
            href={href}
            className="flex items-center gap-3 rounded-[14px] border border-[var(--legacy-border)] bg-card p-3.5 shadow-[0_1px_3px_rgba(42,36,29,0.04)] transition-colors hover:bg-[var(--legacy-page-surface)]" prefetch={false}
          >
            {body}
          </IntentPrefetchLink>
        ) : (
          <div key={activity.id} className="flex items-center gap-3 rounded-[14px] border border-[var(--legacy-border)] bg-card p-3.5 shadow-[0_1px_3px_rgba(42,36,29,0.04)]">
            {body}
          </div>
        );
      })}
      <IntentPrefetchLink href={ROUTES.activity} prefetch={false} className="block text-center text-sm text-primary hover:underline pt-1">
        عرض سجل النشاط كاملاً
      </IntentPrefetchLink>
    </div>
  );
}
