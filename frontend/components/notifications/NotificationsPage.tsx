'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  Loader2,
  Settings,
  Trash2,
  RefreshCw,
  WifiOff,
  MailOpen,
  Circle,
} from 'lucide-react';
import { useMyNotifications, useUnreadNotificationCount } from '@/hooks/queries/useNotifications';
import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDeleteNotification,
  useDeleteAllReadNotifications,
  useMarkNotificationUnread,
} from '@/hooks/mutations/useNotificationMutations';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import {
  TYPE_ICON,
  TYPE_LABEL,
  hrefFor,
  NOTIFICATION_CATEGORIES,
  groupNotificationsByDay,
  groupNotificationsByContext,
  type NotificationCategoryId,
} from '@/lib/notificationMeta';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types/notification.types';
import { onPwaUpdateAvailable } from '@/components/pwa/UpdatePrompt';

const PAGE_SIZE = 20;

type ReadTab = 'all' | 'unread';

export function NotificationsPage() {
  const [readTab, setReadTab] = useState<ReadTab>('all');
  const [category, setCategory] = useState<NotificationCategoryId>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pwaReg, setPwaReg] = useState<ServiceWorkerRegistration | null>(null);
  // SW-FIX-NOTIF-CONFIRM-DIALOG: replaced window.confirm with the shared
  // ConfirmDialog (same as every other destructive action in the app).
  const [confirmDeleteRead, setConfirmDeleteRead] = useState(false);
  const online = useOnlineStatus();

  useEffect(() => {
    return onPwaUpdateAvailable(setPwaReg);
  }, []);

  const { data: unreadCount = 0 } = useUnreadNotificationCount();

  // الطلب الأساسي بدون unreadOnly ليعمل الأوفلاين من الكاش؛
  // الفلترة تُطبَّق محلياً + category يُرسل للخادم عند الاتصال.
  const queryParams = useMemo(
    () => ({
      page: 1,
      limit,
      ...(category !== 'all' ? { category } : {}),
    }),
    [limit, category],
  );

  const { data, isLoading, isFetching, isError, refetch, dataUpdatedAt } =
    useMyNotifications(queryParams);
  const markRead = useMarkNotificationRead();
  const markUnread = useMarkNotificationUnread();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteOne = useDeleteNotification();
  const deleteAllRead = useDeleteAllReadNotifications();

  const items = data?.items ?? [];
  const filteredByRead = readTab === 'unread' ? items.filter((n) => !n.readAt) : items;
  const groups = useMemo(() => {
    return groupNotificationsByDay(filteredByRead).map((day) => ({
      ...day,
      items: groupNotificationsByContext(day.items).flatMap((ctx) => {
        if (ctx.items.length <= 1) return ctx.items;
        // Represent stack as the newest item with a combined title
        const head = { ...ctx.items[0]! };
        head.title = ctx.label;
        head.body =
          ctx.items.length > 1
            ? `${ctx.items.length} إشعارات مشابهة`
            : head.body;
        return [head];
      }),
    }));
  }, [filteredByRead]);
  const hasMore = Boolean(data?.meta?.hasNextPage);
  const loadingMore = isFetching && !isLoading;
  const showHardError = isError && items.length === 0;
  const showStaleNotice = !online && items.length > 0;

  function onRowClick(n: Notification) {
    if (!n.readAt) markRead.mutate(n.id);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {unreadCount > 0 ? (
            <p className="text-sm font-medium text-muted-foreground">
              {unreadCount} غير مقروء
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">لا يوجد غير مقروء</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="min-h-10 gap-1.5"
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
            onClick={() => setConfirmDeleteRead(true)}
            className="gap-1.5 text-muted-foreground"
          >
            {deleteAllRead.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            مسح المقروء
          </Button>
          <ConfirmDialog
            open={confirmDeleteRead}
            onOpenChange={setConfirmDeleteRead}
            title="حذف كل الإشعارات المقروءة؟"
            description="سيتم حذف جميع الإشعارات المقروءة نهائياً. لا يمكن التراجع عن هذا الإجراء."
            confirmLabel="حذف"
            destructive
            isPending={deleteAllRead.isPending}
            onConfirm={() => {
              deleteAllRead.mutate(undefined, {
                onSettled: () => setConfirmDeleteRead(false),
              });
            }}
          />
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={ROUTES.settings.notifications}>
              <Settings className="h-3.5 w-3.5" />
              الإعدادات
            </Link>
          </Button>
        </div>
      </div>

      {showStaleNotice && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          أنت دون اتصال — تُعرض آخر الإشعارات المحفوظة على جهازك
          {dataUpdatedAt
            ? ` (آخر تحديث: ${new Date(dataUpdatedAt).toLocaleString('ar-EG', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })})`
            : ''}
          .
        </p>
      )}

      {/* فئات */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {NOTIFICATION_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setCategory(c.id);
              setLimit(PAGE_SIZE);
            }}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              category === c.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* الكل / غير مقروء */}
      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
        {(
          [
            { id: 'all' as const, label: 'الكل' },
            {
              id: 'unread' as const,
              label: unreadCount > 0 ? `غير مقروء (${unreadCount})` : 'غير مقروء',
            },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setReadTab(t.id);
              setLimit(PAGE_SIZE);
            }}
            className={cn(
              'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              readTab === t.id
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
        ) : showHardError ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm text-destructive">تعذّر تحميل الإشعارات</p>
            <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : filteredByRead.length === 0 && !pwaReg ? (
          <EmptyState
            className="py-12"
            icon={<Bell className="h-10 w-10" />}
            title={
              readTab === 'unread'
                ? 'لا توجد إشعارات غير مقروءة'
                : category !== 'all'
                  ? 'لا إشعارات في هذه الفئة'
                  : 'لا توجد إشعارات'
            }
            description={
              readTab === 'unread'
                ? 'كل شيء مقروء — ستظهر الإشعارات الجديدة هنا.'
                : 'ستظهر هنا التنبيهات عند وصول رسائل أو تحديثات تهمّك.'
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={ROUTES.messages}>الرسائل</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link href={ROUTES.home}>الرئيسية</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <div>
            {pwaReg && (
              <Link
                href="/update"
                className="flex w-full items-start gap-3 border-b bg-primary/[0.04] p-4 text-start transition-colors hover:bg-primary/10"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <RefreshCw className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">تحديث التطبيق متاح</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    اضغط لعرض تفاصيل التحديث وتفعيله
                  </p>
                </div>
              </Link>
            )}

            {groups.map((group) => (
              <div key={group.label}>
                <div className="sticky top-0 z-[1] border-b bg-muted/60 px-4 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur-sm">
                  {group.label}
                </div>
                <ul className="divide-y">
                  {group.items.map((n) => {
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
                            unread
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  'text-sm line-clamp-1',
                                  unread && 'font-semibold',
                                )}
                              >
                                {n.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {TYPE_LABEL[n.type] ?? n.type}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {formatRelativeTime(n.createdAt)}
                              </span>
                              {unread && (
                                <span className="ms-1 h-2 w-2 rounded-full bg-primary" />
                              )}
                            </div>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-3">
                            {n.body}
                          </p>
                          <div className="mt-2 flex items-center gap-1">
                            {unread ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                disabled={markRead.isPending}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  markRead.mutate(n.id);
                                }}
                              >
                                <MailOpen className="h-3 w-3" />
                                تعليم كمقروء
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                disabled={markUnread.isPending}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  markUnread.mutate(n.id);
                                }}
                              >
                                <Circle className="h-3 w-3" />
                                تعليم كغير مقروء
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label="حذف الإشعار"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              disabled={deleteOne.isPending}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                deleteOne.mutate(n.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                              حذف
                            </button>
                          </div>
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
                          <button
                            type="button"
                            className="w-full text-start"
                            onClick={() => onRowClick(n)}
                          >
                            {inner}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {hasMore && filteredByRead.length > 0 && (
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
