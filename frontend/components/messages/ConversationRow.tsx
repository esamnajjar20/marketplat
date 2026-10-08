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
  isLast,
  onSetFlags,
  onDelete,
}: Props) {
  const party = otherParty(conversation, userId);
  const avatar = getAvatarUrl(party.avatarUrl ?? '', 56);
  const isSelected = conversation.id === selectedId;
  const hasUnread = conversation.unreadCount > 0;
  const ctx = contextLabel(conversation);
  const settings = conversation.mySettings;
  const muted = Boolean(settings?.mutedUntil && new Date(settings.mutedUntil).getTime() > Date.now());
  const now = useNowAfterMount(true, conversation.updatedAt) ?? Date.now();

  return (
    <div
      className={cn(
        'group relative flex min-h-[4.5rem] items-center gap-2 px-2 py-2.5 transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-primary/5 dark:bg-primary/10',
        hasUnread && !isSelected && 'bg-primary/[0.03]',
        '[content-visibility:auto] [contain-intrinsic-size:auto_76px]',
      )}
    >
      <Link
        href={ROUTES.conversationDetail(conversation.id)}
        aria-current={isSelected ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1 touch-manipulation"
      >
        {isSelected && <span className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-primary" aria-hidden />}
        <div className="relative shrink-0">
          <div className={cn('relative h-14 w-14 overflow-hidden rounded-full bg-muted shadow-sm', isSelected ? 'ring-2 ring-primary/30' : 'ring-2 ring-card')}>
            <SafeImage variant="avatar" src={avatar} alt={party.name} fill className="object-cover" sizes="56px" />
          </div>
          {isOnline && <span className="absolute bottom-0 end-0 h-3.5 w-3.5 rounded-full bg-online ring-2 ring-card" aria-label="متصل الآن" title="متصل الآن" />}
          {hasUnread && <span className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-2xs-tight font-semibold text-primary-foreground ring-2 ring-card">{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <p className={cn('flex items-center gap-1 text-sm line-clamp-1', hasUnread ? 'font-bold text-foreground' : 'font-semibold text-foreground/90')}>
              {settings?.pinnedAt && <Pin className="h-3 w-3 shrink-0 text-primary" aria-label="مثبّتة" />}
              {party.name}
            </p>
            <span className={cn('shrink-0 text-2xs leading-tight tabular-nums', hasUnread ? 'font-semibold text-primary' : 'text-muted-foreground')}>
              {formatRelativeTimeShort(conversation.updatedAt, now)}
            </span>
          </div>
          <p className={cn('text-xs line-clamp-1 leading-relaxed', hasUnread ? 'font-medium text-foreground/80' : 'text-muted-foreground')}>
            {previewText(conversation, userId)}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground/80">
            {muted && <span className="inline-flex items-center gap-0.5"><BellOff className="h-3 w-3" /> عدم الإزعاج</span>}
            {ctx && conversation.lastMessage && <span className="line-clamp-1">{muted ? '· ' : ''}بخصوص: {ctx}</span>}
          </div>
        </div>
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
      {!isLast && <div className="absolute bottom-0 inset-x-4 h-px bg-border/80" />}
    </div>
  );
});
