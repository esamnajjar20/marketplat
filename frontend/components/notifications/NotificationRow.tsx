'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import { memo } from 'react';
import Link from 'next/link';
import { Circle, MailOpen, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hrefFor } from '@/lib/notificationMeta';
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
 * صف إشعار — مطابق لتصميم مركز الإشعارات (عنوان + نص + وقت).
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
  const href = hrefFor(n);
  const unread = !n.readAt;

  const inner = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[#F6F1E7]/60',
        unread && 'bg-[#E8F1EC]/35',
        '[content-visibility:auto] [contain-intrinsic-size:auto_88px]',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p
            className={cn(
              'text-[14px] leading-snug text-[#2A241D] line-clamp-2',
              unread && 'font-bold',
            )}
          >
            {n.title}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-[#6B6459]">
            <HydrationSafeRelativeTime date={n.createdAt} />
          </span>
        </div>
        {n.body && (
          <p className="mt-1 text-[13px] leading-relaxed text-[#6B6459] line-clamp-2">
            {n.body}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1">
          {unread ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#6B6459] hover:bg-[#F6F1E7] hover:text-[#2A241D]"
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
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#6B6459] hover:bg-[#F6F1E7] hover:text-[#2A241D]"
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
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#6B6459] hover:bg-[#FBE9E7] hover:text-[#9B2118]"
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
      {unread && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#397F56]" aria-label="غير مقروء" />
      )}
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
