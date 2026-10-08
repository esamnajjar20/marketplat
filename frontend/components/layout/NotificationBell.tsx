'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/shared/ui/DropdownMenu';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useMyNotifications, useUnreadNotificationCount } from '@/hooks/queries/useNotifications';
import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/mutations/useNotificationMutations';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { Notification, NotificationType } from '@/types/notification.types';
import { hrefFor, iconFor, labelFor } from '@/lib/notificationMeta';
import { getBrowserNotificationPermission, isPushSupported } from '@/lib/pwa';
import { onPwaUpdateAvailable } from '@/components/pwa/UpdatePrompt';

function NotificationRow({
  notification,
  onNotificationClick,
}: {
  notification: Notification;
  onNotificationClick: (notification: Notification) => void;
}) {
  const Icon = iconFor(notification.type);
  const href = hrefFor(notification);
  const isUnread = !notification.readAt;

  function handleClick() {
    if (isUnread) onNotificationClick(notification);
  }

  const content = (
    <div
      className={cn(
        'flex items-start gap-2.5 p-3 text-start transition-colors hover:bg-muted/50',
        isUnread && 'bg-primary/5',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm line-clamp-1', isUnread && 'font-medium')}>
            {notification.title}
          </p>
          {isUnread && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.body}</p>
        <p className="text-2xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} onClick={handleClick} className="block">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className="w-full">
      {content}
    </button>
  );
}

type NotificationGroupT =
  | { kind: 'single'; notification: Notification }
  | { kind: 'group'; type: NotificationType; notifications: Notification[] };

function groupNotifications(items: Notification[]): NotificationGroupT[] {
  const result: NotificationGroupT[] = [];
  let i = 0;
  while (i < items.length) {
    let j = i + 1;
    while (j < items.length && items[j]?.type === items[i]?.type) j++;
    const run = items.slice(i, j);
    if (run.length >= 3) {
      result.push({ kind: 'group', type: run[0]!.type, notifications: run });
    } else {
      for (const n of run) result.push({ kind: 'single', notification: n });
    }
    i = j;
  }
  return result;
}

function NotificationGroupRow({
  type,
  notifications,
  onNotificationClick,
}: {
  type: NotificationType;
  notifications: Notification[];
  onNotificationClick: (notification: Notification) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = iconFor(type);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  if (expanded) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex w-full items-center gap-2 p-2 text-xs text-muted-foreground hover:bg-muted/50"
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          طي {labelFor(type)}
        </button>
        <div className="divide-y border-t">
          {notifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onNotificationClick={onNotificationClick}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className={cn(
        'flex w-full items-start gap-2.5 p-3 text-start transition-colors hover:bg-muted/50',
        unreadCount > 0 && 'bg-primary/5',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          unreadCount > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm', unreadCount > 0 && 'font-medium')}>
            {labelFor(type)} ({notifications.length})
          </p>
          {unreadCount > 0 && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{notifications[0]!.body}</p>
        <p className="text-2xs text-muted-foreground">
          {formatRelativeTime(notifications[0]!.createdAt)}
        </p>
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data: notificationsPage, isLoading } = useMyNotifications({ limit: 10 }, { enabled: open });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [pwaReg, setPwaReg] = useState<ServiceWorkerRegistration | null>(null);
  const [pushDenied, setPushDenied] = useState(false);

  useEffect(() => {
    return onPwaUpdateAvailable(setPwaReg);
  }, []);

  useEffect(() => {
    if (!isPushSupported()) return;
    setPushDenied(getBrowserNotificationPermission() === 'denied');
  }, []);

  const items = notificationsPage?.items ?? [];
  const groups = groupNotifications(items);
  const displayUnread = unreadCount + (pwaReg ? 1 : 0);

  function handleNotificationClick(notification: Notification) {
    const siblingIds =
      notification.type === 'NEW_MESSAGE' && notification.data?.conversationId
        ? items
            .filter(
              (n) =>
                n.type === 'NEW_MESSAGE' &&
                !n.readAt &&
                n.data?.conversationId === notification.data?.conversationId,
            )
            .map((n) => n.id)
        : [notification.id];

    for (const id of siblingIds) markRead.mutate(id);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-10 w-10 items-center justify-center rounded-full outline-none ring-offset-background transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="الإشعارات"
        >
          <Bell className="h-5 w-5" />
          {displayUnread > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-medium text-destructive-foreground">
              {displayUnread > 99 ? '99+' : displayUnread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 p-3">
          <DropdownMenuLabel className="p-0 font-normal">الإشعارات</DropdownMenuLabel>
          <div className="flex items-center gap-2">
          {pushDenied && (
            <Link
              href={ROUTES.settings.notifications}
              className="text-2xs text-warning-strong hover:underline dark:text-warning"
            >
              الجهاز متوقف
            </Link>
          )}
          {unreadCount > 0 && (
            <button
              type="button"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              تعليم الكل كمقروء
            </button>
          )}
          </div>
        </div>
        <DropdownMenuSeparator className="m-0" />

        <div className="max-h-96 overflow-y-auto">
          {pwaReg && (
            <Link
              href="/update"
              className="flex w-full items-start gap-2.5 border-b bg-primary/5 p-3 text-start transition-colors hover:bg-primary/10"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">تحديث التطبيق متاح</p>
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                </div>
                <p className="text-xs text-muted-foreground">
                  اضغط لعرض تفاصيل التحديث وتفعيله
                </p>
              </div>
            </Link>
          )}
          {isLoading ? (
            <div className="flex flex-col gap-0 divide-y" role="status" aria-label="جارٍ التحميل">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 animate-pulse">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-muted" />
                    <div className="h-3 w-full rounded bg-muted/70" />
                    <div className="h-2 w-1/4 rounded bg-muted/50" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 && !pwaReg ? (
            <EmptyState
              className="py-8"
              icon={<Bell className="h-8 w-8" />}
              title="لا توجد إشعارات"
              description="ستظهر هنا التنبيهات عند وصول رسائل أو تحديثات تهمّك"
            />
          ) : items.length === 0 && pwaReg ? (
            null
          ) : (
            <div className="divide-y">
              {groups.map((g) =>
                g.kind === 'single' ? (
                  <NotificationRow
                    key={g.notification.id}
                    notification={g.notification}
                    onNotificationClick={handleNotificationClick}
                  />
                ) : (
                  <NotificationGroupRow
                    key={`${g.type}-${g.notifications[0]!.id}`}
                    type={g.type}
                    notifications={g.notifications}
                    onNotificationClick={handleNotificationClick}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />
        <div className="p-2">
          <Link
            href={ROUTES.notifications}
            className="flex w-full items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-muted/60"
          >
            عرض كل الإشعارات
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shared by full notifications page. */
export { hrefFor, TYPE_ICON, TYPE_LABEL } from '@/lib/notificationMeta';

