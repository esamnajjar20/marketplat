'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import Link from 'next/link';
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
import { useMyActivity } from '@/hooks/queries/useActivity';
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
  const { data, isLoading, isError, refetch } = useMyActivity({ limit: 8 });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (isError) {
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
      <div className="text-center py-6 text-sm text-muted-foreground">
        لا يوجد نشاط بعد.{' '}
        <Link href={ROUTES.adCreate} className="text-primary hover:underline">
          انشر أول إعلان
        </Link>
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
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{activity.title}</p>
              <p className="text-xs text-muted-foreground truncate">
                {activity.description ? `${activity.description} · ` : ''}
                {<HydrationSafeRelativeTime date={activity.createdAt} />}
              </p>
            </div>
          </>
        );

        return href ? (
          <Link
            key={activity.id}
            href={href}
            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            {body}
          </Link>
        ) : (
          <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg border">
            {body}
          </div>
        );
      })}
      <Link href={ROUTES.activity} className="block text-center text-sm text-primary hover:underline pt-1">
        عرض سجل النشاط كاملاً
      </Link>
    </div>
  );
}
