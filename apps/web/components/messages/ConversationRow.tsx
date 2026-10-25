'use client';

import { memo } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Pin, Archive, Trash2, MoreVertical, BellOff, Bell } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/shared/ui/DropdownMenu';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTimeShort } from '@/lib/formatters';
import { useNowAfterMount } from '@/components/shared/cards/cardParts';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { Conversation, ConversationListItem } from '@/types/conversation.types';

function otherParty(conversation: Conversation, userId: string | undefined) {
  return conversation.buyerId === userId ? conversation.seller : conversation.buyer;
}

function contextLabel(conversation: ConversationListItem): string | null {
  if (conversation.context?.title) return conversation.context.title;
  if (conversation.ad?.title) return conversation.ad.title;
  if (conversation.serviceRequest?.listing?.title) return conversation.serviceRequest.listing.title;
  return null;
}

function previewText(conversation: ConversationListItem, userId: string | undefined): string {
  const last = conversation.lastMessage;
  if (!last) return contextLabel(conversation) ?? 'محادثة عامة';
  if (last.deletedAt) return 'تم حذف هذه الرسالة';
  const mine = userId && last.senderId === userId;
  const body = last.body.trim() || '…';
  return mine ? `أنت: ${body}` : body;
}

interface Props {
  conversation: ConversationListItem;
  userId?: string;
  selectedId?: string;
  isOnline: boolean;
  isFlagPending: boolean;
  isLast: boolean;
  onSetFlags: (input: { id: string; pinned?: boolean; archived?: boolean; mutedUntil?: string | null }) => void;
  onDelete: (id: string) => void;
}

export const ConversationRow = memo(function ConversationRow({
  conversation,
  userId,
  selectedId,
  isOnline,
  isFlagPending,
  isLast: _isLast,
  onSetFlags,
  onDelete,
}: Props) {
  void _isLast;
  const party = otherParty(conversation, userId);
  const avatar = getAvatarUrl(party.avatarUrl ?? '', 56);
  const isSelected = conversation.id === selectedId;
  const hasUnread = conversation.unreadCount > 0;
  const ctx = contextLabel(conversation);
  const settings = conversation.mySettings;
  // HYDRATION-SAFE: must match AdCard / ProductCard / ServiceListingCard.
  // The ?? Date.now() fallback defeated useNowAfterMount's null-before-mount
  // contract — server (S) and client (C) produced different `now`, and when
  // the S↔C delta crossed a relative-time bucket boundary React #418 fired.
  const now = useNowAfterMount(true, conversation.updatedAt);
  const muted = Boolean(
    settings?.mutedUntil &&
    now !== null &&
    new Date(settings.mutedUntil).getTime() > now,
  );

  const timeLabel = now !== null ? formatRelativeTimeShort(conversation.updatedAt, now) : '';

  return (
    <div
      className={cn(
        'native-inbox-row group relative flex min-h-[4.75rem] items-start gap-2 px-3 py-3.5 transition-colors',
        'hover:bg-muted/40 active:bg-muted/50',
        isSelected && 'bg-primary/[0.06]',
        settings?.pinnedAt && !isSelected && 'bg-primary/[0.03]',
        hasUnread && !isSelected && !settings?.pinnedAt && 'bg-primary/[0.02]',
        '[content-visibility:auto] [contain-intrinsic-size:auto_80px]',
      )}
    >
      <Link
        href={ROUTES.conversationDetail(conversation.id)}
        aria-current={isSelected ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-start gap-3 touch-manipulation"
      >
        {isSelected && <span className="absolute inset-y-3 start-0 w-1 rounded-e-full bg-primary" aria-hidden />}
        <div className="relative shrink-0">
          <div className={cn(
            'relative flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full bg-primary-soft text-lg font-extrabold text-primary shadow-sm',
            isSelected && 'ring-2 ring-primary/35',
          )}>
            <SafeImage variant="avatar" src={avatar} alt={party.name} fill className="object-cover" sizes="52px" />
          </div>
          {isOnline && (
            <span
              className="absolute bottom-0.5 end-0.5 h-3 w-3 rounded-full bg-online ring-[2.5px] ring-background"
              aria-label="متصل الآن"
              title="متصل الآن"
            />
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <p className={cn(
              'flex min-w-0 items-center gap-1.5 text-[15px] leading-tight line-clamp-1',
              hasUnread ? 'font-bold text-foreground' : 'font-bold text-foreground/90',
            )}>
              {settings?.pinnedAt && <Pin className="h-3.5 w-3.5 shrink-0 text-primary opacity-80" aria-label="مثبّتة" />}
              <span className="truncate">{party.name}</span>
              {muted && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  <BellOff className="h-2.5 w-2.5" /> عدم الإزعاج
                </span>
              )}
            </p>
            {timeLabel && (
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  hasUnread
                    ? 'rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground'
                    : 'text-[12px] text-muted-foreground',
                )}
              >
                {timeLabel}
              </span>
            )}
          </div>
          <p className={cn(
            'text-[13px] leading-snug line-clamp-1',
            hasUnread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
          )}>
            {previewText(conversation, userId)}
          </p>
          {ctx && conversation.lastMessage && (
            <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground/80 line-clamp-1">
              بخصوص: {ctx}
            </p>
          )}
        </div>
        {hasUnread && (
          <span
            aria-label={`${conversation.unreadCount} رسالة غير مقروءة`}
            className="mt-1 flex h-5 min-w-5 shrink-0 items-center justify-center self-start rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground"
          >
            {conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}
          </span>
        )}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground" aria-label={`خيارات محادثة ${party.name}`} onClick={(e) => e.stopPropagation()}>
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem disabled={isFlagPending} onClick={() => onSetFlags({ id: conversation.id, pinned: !settings?.pinnedAt })}>
            <Pin className="h-4 w-4" />{settings?.pinnedAt ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isFlagPending} onClick={() => onSetFlags({ id: conversation.id, archived: !settings?.archivedAt })}>
            <Archive className="h-4 w-4" />{settings?.archivedAt ? 'إلغاء الأرشفة' : 'أرشفة المحادثة'}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isFlagPending} onClick={() => onSetFlags({ id: conversation.id, mutedUntil: muted ? null : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() })}>
            {muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {muted ? 'تشغيل الإشعارات' : 'عدم الإزعاج لمدة 8 ساعات'}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(conversation.id)}>
            <Trash2 className="h-4 w-4" />حذف المحادثة
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
