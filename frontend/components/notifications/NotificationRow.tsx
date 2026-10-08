'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Circle, MailOpen, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import { hrefFor, iconFor, labelFor } from '@/lib/notificationMeta';
import type { Notification } from '@/types/notification.types';

type Props = {
  notification: Notification;
  onOpen: (notification: Notification) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onDelete: (id: string) => void;
  markReadPending: boolean;
  markUnreadPending: boolean;
  deletePending: boolean;
};

/**
 * Isolates one notification from page-level filter/pagination state changes.
 * The notification object is the row's only data dependency, so unrelated
 * controls no longer force every row to rebuild its subtree.
 */
export const NotificationRow = memo(function NotificationRow({
  notification: n,
  onOpen,
  onMarkRead,
  onMarkUnread,
  onDelete,
  markReadPending,
  markUnreadPending,
  deletePending,
}: Props) {
  const Icon = iconFor(n.type);
  const href = hrefFor(n);
  const unread = !n.readAt;

  const inner = (
    <div
      className={cn(
        'flex items-start gap-3 p-4 transition-colors hover:bg-muted/40',
        unread && 'bg-primary/[0.04]',
        '[content-visibility:auto] [contain-intrinsic-size:auto_104px]',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn('text-sm line-clamp-1', unread && 'font-semibold')}>
              {n.title}
            </p>
            <p className="mt-0.5 text-2xs-tight text-muted-foreground">{labelFor(n.type)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <span className="text-2xs-tight tabular-nums text-muted-foreground">
              {formatRelativeTime(n.createdAt)}
            </span>
            {unread && <span className="ms-1 h-2 w-2 rounded-full bg-primary" />}
          </div>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-3">{n.body}</p>
        <div className="mt-2 flex items-center gap-1">
          {unread ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs-tight text-muted-foreground hover:bg-muted hover:text-foreground"
              disabled={markReadPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMarkRead(n.id);
              }}
            >
              <MailOpen className="h-3 w-3" />
              تعليم كمقروء
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs-tight text-muted-foreground hover:bg-muted hover:text-foreground"
              disabled={markUnreadPending}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMarkUnread(n.id);
              }}
            >
              <Circle className="h-3 w-3" />
              تعليم كغير مقروء
            </button>
          )}
          <button
            type="button"
            aria-label="حذف الإشعار"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs-tight text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            disabled={deletePending}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(n.id);
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
    <li>
      {href ? (
        <Link href={href} onClick={() => onOpen(n)} className="block">
          {inner}
        </Link>
      ) : (
        <button type="button" className="w-full text-start" onClick={() => onOpen(n)}>
          {inner}
        </button>
      )}
    </li>
  );
});
