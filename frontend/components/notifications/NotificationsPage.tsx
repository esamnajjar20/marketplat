'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Loader2, Settings, Trash2 } from 'lucide-react';
import { useMyNotifications, useUnreadNotificationCount } from '@/hooks/queries/useNotifications';
import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteAllReadNotifications,
} from '@/hooks/mutations/useNotificationMutations';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { TYPE_ICON, TYPE_LABEL, hrefFor } from '@/components/layout/NotificationBell';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types/notification.types';

const PAGE_SIZE = 20;

type Tab = 'all' | 'unread';

export function NotificationsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data, isLoading, isFetching, isError, refetch } = useMyNotifications({
    page: 1,
    limit,
    unreadOnly: tab === 'unread',
  });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteOne = useDeleteNotification();
  const deleteAllRead = useDeleteAllReadNotifications();

  const items = data?.items ?? [];
  const hasMore = Boolean(data?.meta?.hasNextPage);
  const loadingMore = isFetching && !isLoading;

  const tabs = useMemo(
    () =>
      [
        { id: 'all' as const, label: 'الكل' },
        { id: 'unread' as const, label: unreadCount > 0 ? `غير مقروء (${unreadCount})` : 'غير مقروء' },
      ] as const,
    [unreadCount],
  );

  function onRowClick(n: Notification) {
    if (!n.readAt) markRead.mutate(n.id);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">الإشعارات</h1>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="gap-1.5"
            >
              {markAllRead.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              تعليم الكل كمقروء
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deleteAllRead.isPending}
            onClick={() => {
              if (typeof window !== 'undefined' && !window.confirm('حذف كل الإشعارات المقروءة؟')) return;
              deleteAllRead.mutate();
            }}
            className="gap-1.5 text-muted-foreground"
          >
            {deleteAllRead.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            مسح المقروء
          </Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={ROUTES.settings.notifications}>
              <Settings className="h-3.5 w-3.5" />
              الإعدادات
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setLimit(PAGE_SIZE);
            }}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {isLoading ? (
          <div className="divide-y" role="status" aria-label="جارٍ التحميل">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-4 animate-pulse">
                <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm text-destructive">تعذّر تحميل الإشعارات</p>
            <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={<Bell className="h-10 w-10" />}
            title={tab === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'}
            description={
              tab === 'unread'
                ? 'كل شيء مقروء — ستظهر الإشعارات الجديدة هنا.'
                : 'ستظهر هنا التنبيهات عند وصول رسائل أو تحديثات تهمّك.'
            }
          />
        ) : (
          <ul className="divide-y">
            {items.map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Bell;
              const href = hrefFor(n);
              const unread = !n.readAt;
              const inner = (
                <div
                  className={cn(
                    'flex items-start gap-3 p-4 transition-colors hover:bg-muted/40',
                    unread && 'bg-primary/[0.04]',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={cn('text-sm line-clamp-1', unread && 'font-semibold')}>
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {TYPE_LABEL[n.type] ?? n.type}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                        {unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                        <button
                          type="button"
                          aria-label="حذف الإشعار"
                          className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          disabled={deleteOne.isPending}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteOne.mutate(n.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {n.body}
                    </p>
                  </div>
                </div>
              );

              return (
                <li key={n.id}>
                  {href ? (
                    <Link href={href} onClick={() => onRowClick(n)} className="block">
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" className="w-full text-start" onClick={() => onRowClick(n)}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && items.length > 0 && (
          <div className="flex justify-center border-t p-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loadingMore}
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="gap-2"
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تحميل المزيد
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
