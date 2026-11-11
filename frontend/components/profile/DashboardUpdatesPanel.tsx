'use client';

import { useState } from 'react';
import { Activity, Bell, ChevronDown, ExternalLink } from 'lucide-react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { RecentActivityFeed } from '@/components/profile/RecentActivityFeed';
import { SellerTodayTasks } from '@/components/profile/SellerTodayTasks';
import { useMyNotifications, useUnreadNotificationCount } from '@/hooks/queries/useNotifications';
import { useMarkNotificationRead } from '@/hooks/mutations/useNotificationMutations';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { hrefFor, iconFor } from '@/lib/notificationMeta';
import { ROUTES } from '@/lib/constants';

/**
 * Keeps activity/task and notification-list queries dormant until the user
 * explicitly opens this dashboard panel. The global header unread badge stays
 * active and shares its existing React Query cache with this component.
 */
export function DashboardUpdatesPanel() {
  const [expanded, setExpanded] = useState(false);
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data: notificationsPage, isLoading, isError, refetch } = useMyNotifications(
    { limit: 5 },
    { enabled: expanded },
  );
  const markRead = useMarkNotificationRead();
  const notifications = notificationsPage?.items ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="dashboard-updates-content"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-16 w-full items-center gap-3 p-4 text-start transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bell className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">التحديثات والنشاط</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            عرض الإشعارات وآخر نشاطات حسابك عند الطلب
          </span>
        </span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount} جديد
          </span>
        )}
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {expanded && (
        <div id="dashboard-updates-content" className="space-y-5 border-t border-border p-4 sm:p-5">
          <section className="space-y-3" aria-labelledby="dashboard-notifications-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="dashboard-notifications-heading" className="flex items-center gap-2 text-sm font-semibold">
                <Bell className="h-4 w-4 text-primary" aria-hidden />
                الإشعارات
              </h2>
              <IntentPrefetchLink href={ROUTES.notifications} prefetch={false} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                عرض الكل <ExternalLink className="h-3 w-3" aria-hidden />
              </IntentPrefetchLink>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-5"><LoadingSpinner size="sm" /></div>
            ) : isError ? (
              <div className="py-4 text-center text-sm">
                <p className="text-destructive">تعذّر تحميل الإشعارات</p>
                <button type="button" onClick={() => void refetch()} className="mt-1 text-primary hover:underline">إعادة المحاولة</button>
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState icon={<Bell className="h-6 w-6" />} title="لا توجد إشعارات حديثة" description="ستظهر هنا الإشعارات الجديدة عند وصولها" className="py-5" />
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {notifications.map((notification) => {
                  const Icon = iconFor(notification.type);
                  const href = hrefFor(notification);
                  const content = (
                    <span className="flex min-w-0 flex-1 items-start gap-3 p-3 text-start">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{notification.title}</span>
                        <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{notification.body}</span>
                        <span className="mt-1 block text-2xs-tight text-muted-foreground"><HydrationSafeRelativeTime date={notification.createdAt} /></span>
                      </span>
                      {!notification.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="غير مقروء" />}
                    </span>
                  );
                  return href ? (
                    <IntentPrefetchLink key={notification.id} href={href} prefetch={false} onClick={() => { if (!notification.readAt) markRead.mutate(notification.id); }} className="flex hover:bg-muted/40">
                      {content}
                    </IntentPrefetchLink>
                  ) : (
                    <button key={notification.id} type="button" className="flex w-full hover:bg-muted/40" onClick={() => { if (!notification.readAt) markRead.mutate(notification.id); }}>
                      {content}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="dashboard-activity-heading">
            <h2 id="dashboard-activity-heading" className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="h-4 w-4 text-primary" aria-hidden />
              آخر النشاطات
            </h2>
            <SellerTodayTasks />
            <div className="rounded-xl border border-border/70 bg-card p-3 sm:p-4">
              <RecentActivityFeed />
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
