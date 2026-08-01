'use client';

import Link from 'next/link';
import { Bell, MessageSquare, Tag, Megaphone, BarChart3, CheckCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/shared/ui/DropdownMenu';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
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

const TYPE_ICON: Record<NotificationType, typeof MessageSquare> = {
  NEW_MESSAGE: MessageSquare,
  FAV_AD_PRICE_CHANGED: Tag,
  PROMOTION: Megaphone,
  WEEKLY_AD_VIEWS_REPORT: BarChart3,
};

/** Where clicking a notification row should navigate — null means the
 * row is informational only (no known deep link for this type/data
 * combination yet, e.g. a PROMOTION with no adId). */
function hrefFor(notification: Notification): string | null {
  if (notification.type === 'NEW_MESSAGE' && notification.data?.conversationId) {
    return ROUTES.conversationDetail(notification.data.conversationId);
  }
  if (notification.type === 'FAV_AD_PRICE_CHANGED' && notification.data?.adId) {
    return ROUTES.adDetail(notification.data.adId);
  }
  return null;
}

function NotificationRow({ notification }: { notification: Notification }) {
  const markRead = useMarkNotificationRead();
  const Icon = TYPE_ICON[notification.type];
  const href = hrefFor(notification);
  const isUnread = !notification.readAt;

  function handleClick() {
    if (isUnread) markRead.mutate(notification.id);
  }

  const content = (
    <div
      className={cn(
        'flex items-start gap-2.5 p-3 text-start transition-colors hover:bg-muted/50',
        isUnread && 'bg-primary/5'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm line-clamp-1', isUnread && 'font-medium')}>{notification.title}</p>
          {isUnread && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{notification.body}</p>
        <p className="text-[10px] text-muted-foreground">{formatRelativeTime(notification.createdAt)}</p>
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

/**
 * NotificationBell — Epic 6, the in-app notification center. Sits next
 * to UserMenu in both PublicHeader and ProtectedHeader; reuses the same
 * Radix DropdownMenu primitive UserMenu already uses, but with custom
 * row content instead of DropdownMenuItem links (a notification row
 * needs its own read-state styling and click handling, not a plain nav
 * link).
 */
export function NotificationBell() {
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const { data: notificationsPage, isLoading } = useMyNotifications({ limit: 10 });
  const markAllRead = useMarkAllNotificationsRead();

  const items = notificationsPage?.items ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-full outline-none ring-offset-background transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="الإشعارات"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3">
          <DropdownMenuLabel className="p-0 font-normal">الإشعارات</DropdownMenuLabel>
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
        <DropdownMenuSeparator className="m-0" />

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : items.length === 0 ? (
            <EmptyState className="py-8" icon={<Bell className="h-8 w-8" />} title="لا توجد إشعارات" />
          ) : (
            <div className="divide-y">
              {items.map((notification) => (
                <NotificationRow key={notification.id} notification={notification} />
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
