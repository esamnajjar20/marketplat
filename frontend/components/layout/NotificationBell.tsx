'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, MessageSquare, Tag, Megaphone, BarChart3, CheckCheck, Search, ChevronDown, Flame } from 'lucide-react';
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
  FAV_AD_SOLD: Tag,
  PROMOTION: Megaphone,
  WEEKLY_AD_VIEWS_REPORT: BarChart3,
  SAVED_SEARCH_MATCH: Search,
  // PROMO-1 (Phase 14): same fire icon as ProductCard's live-promotion
  // badge (🔥) for visual consistency with how a promotion is already
  // represented elsewhere in the app.
  PROMOTION_STATUS_CHANGE: Flame,
};

const TYPE_LABEL: Record<NotificationType, string> = {
  NEW_MESSAGE: 'رسائل جديدة',
  FAV_AD_PRICE_CHANGED: 'تغييرات في الأسعار',
  FAV_AD_SOLD: 'إعلانات مُباعة',
  PROMOTION: 'إعلانات ترويجية',
  WEEKLY_AD_VIEWS_REPORT: 'تقارير المشاهدات',
  SAVED_SEARCH_MATCH: 'نتائج بحث محفوظ',
  PROMOTION_STATUS_CHANGE: 'عروضي',
};

/** Where clicking a notification row should navigate — null means the
 * row is informational only (no known deep link for this type/data
 * combination yet, e.g. a PROMOTION with no adId). */
function hrefFor(notification: Notification): string | null {
  if (notification.type === 'NEW_MESSAGE' && notification.data?.conversationId) {
    return ROUTES.conversationDetail(notification.data.conversationId);
  }
  if (
    (notification.type === 'FAV_AD_PRICE_CHANGED' ||
      notification.type === 'FAV_AD_SOLD' ||
      notification.type === 'SAVED_SEARCH_MATCH') &&
    notification.data?.adId
  ) {
    return ROUTES.adDetail(notification.data.adId);
  }
  // PROMO-1 (Phase 14): always the promotions dashboard, not the
  // individual product — the owner's next action for any of the three
  // lifecycle events (started/expiring/expired) is "go look at my
  // promotions", same destination myPromotionsExpiring.ts's push
  // payload already links to.
  if (notification.type === 'PROMOTION_STATUS_CHANGE') {
    return ROUTES.myStorePromotions;
  }
  return null;
}

/**
 * CONV-READ FIX: clicking one NEW_MESSAGE notification used to mark
 * only that single row read — a burst of "رسالة جديدة" notifications
 * from the same conversation (someone sends 4 messages in a row) sat
 * there as 4 separate unread rows even after the caller had already
 * opened the thread and read all of it via the first click. This row
 * no longer calls useMarkNotificationRead itself; it defers to
 * onNotificationClick (see NotificationBell below), which marks every
 * *other* unread NEW_MESSAGE row sharing the same conversationId read
 * at the same time, not just this one.
 *
 * Scoped to conversationId, not sender identity — NotificationData
 * (types/notification.types.ts) only carries conversationId today, no
 * senderId/otherUserId. That's an accurate proxy for "same person" in
 * the common case (one ad ⇒ one conversation ⇒ one counterpart), but
 * two people who've messaged each other about *different* ads get two
 * separate conversationIds and won't be grouped — a real backend field
 * addition, not something fixable from here.
 */
function NotificationRow({
  notification, onNotificationClick,
}: {
  notification: Notification;
  onNotificationClick: (notification: Notification) => void;
}) {
  const Icon = TYPE_ICON[notification.type];
  const href = hrefFor(notification);
  const isUnread = !notification.readAt;

  function handleClick() {
    if (isUnread) onNotificationClick(notification);
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
 * FIX P2-11: consecutive same-type notifications ("مشاهدات إعلانك" ×5,
 * one per glance) each rendered as a full separate row — a burst of
 * activity on one ad buried everything else under repetition. Groups
 * *consecutive* items of the same type (list is already createdAt-desc
 * from the API, so consecutive == temporally adjacent) into a single
 * collapsed summary row once there are 3+ in a run; smaller runs (1-2)
 * render individually since collapsing them saves no real space.
 */
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
  type, notifications, onNotificationClick,
}: {
  type: NotificationType;
  notifications: Notification[];
  onNotificationClick: (notification: Notification) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICON[type];
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
          طي {TYPE_LABEL[type]}
        </button>
        <div className="divide-y border-t">
          {notifications.map((n) => (
            <NotificationRow key={n.id} notification={n} onNotificationClick={onNotificationClick} />
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
        unreadCount > 0 && 'bg-primary/5'
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          unreadCount > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm', unreadCount > 0 && 'font-medium')}>
            {TYPE_LABEL[type]} ({notifications.length})
          </p>
          {unreadCount > 0 && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">{notifications[0]!.body}</p>
        <p className="text-[10px] text-muted-foreground">{formatRelativeTime(notifications[0]!.createdAt)}</p>
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
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
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = notificationsPage?.items ?? [];
  const groups = groupNotifications(items);

  /**
   * CONV-READ FIX: see NotificationRow's own doc comment. Clicking any
   * unread NEW_MESSAGE notification marks every other unread
   * NEW_MESSAGE row in this same dropdown load that shares its
   * conversationId — not just the one clicked. Other notification
   * types are unaffected (single mark-read, same as before), since
   * "several notifications about the same thing" only really applies
   * to messages here — FAV_AD_PRICE_CHANGED/FAV_AD_SOLD/etc. are each
   * about a specific event, not a running thread.
   *
   * Only reaches notifications already loaded in this dropdown (up to
   * 10 — useMyNotifications's own limit above); the backend has no
   * bulk or conversation-scoped mark-read route to reach further than
   * that (notifications.api.ts: "only list + unread-count + the two
   * mark-read actions"). One PATCH per sibling via the existing
   * single-id endpoint — fine for the realistic case (a handful of
   * messages from one person), not something to loop over hundreds of
   * ids without a real bulk endpoint.
   */
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
