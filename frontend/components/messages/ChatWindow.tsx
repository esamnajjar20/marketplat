'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle, ChevronRight, MoreVertical, UserX, UserCheck } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/shared/ui/DropdownMenu';
import { MessageInput } from './MessageInput';
import { useConversation, useMessages } from '@/hooks/queries/useConversations';
import { useIsUserBlocked } from '@/hooks/queries/useBlockedUsers';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { formatTime } from '@/lib/formatters';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/conversation.types';

interface Props {
  conversationId: string;
}

function otherParty(conversation: Conversation, userId: string | undefined) {
  return conversation.buyerId === userId ? conversation.seller : conversation.buyer;
}

/**
 * ChatWindow — Epic 5, the thread view at /messages/:id. Replaces the
 * redirect-to-/messages stub that's been there since FIX AUDIT-V4-03
 * (see app/(protected)/messages/[id]/page.tsx's own comment).
 *
 * Trust & safety follow-up: adds a block/unblock action for the other
 * party, since sendMessage/startFromAd both 403 with USER_BLOCKED once
 * either side has blocked the other (conversations.service.ts) — the
 * composer disables itself the moment that's true, rather than only
 * surfacing it as an error toast after a failed send.
 *
 * DESKTOP-SPLIT-01: this used to own its own border/rounded/height
 * frame, correct when it was the only thing on the page (mobile, or
 * desktop before the split-view existed). It's now rendered inside
 * (protected)/messages/layout.tsx's right-hand pane on >=lg, which
 * already provides that frame for both panes together — a nested
 * border here would double up. The h-full below fills whatever height
 * the caller's wrapper provides instead of computing its own from the
 * viewport, so it behaves the same standalone (viewport-derived
 * wrapper on mobile) or inside the split layout (flex-derived wrapper
 * on desktop) without ChatWindow needing to know which.
 *
 * The back-button's lg:hidden (was sm:hidden) is the other half of
 * this change: below lg there's no sidebar to return to visually, so
 * back navigation matters; at lg and above the sidebar in
 * messages/layout.tsx is already on screen, so a back arrow inside
 * the thread itself would be redundant.
 */
export function ChatWindow({ conversationId }: Props) {
  const user = useAuthStore(selectUser);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const {
    data: conversation,
    isLoading: conversationLoading,
    isError: conversationError,
  } = useConversation(conversationId);
  const { data: messagesPage, isLoading: messagesLoading } = useMessages(conversationId, {
    limit: 50,
  });
  const party = conversation ? otherParty(conversation, user?.id) : null;
  const isBlocked = useIsUserBlocked(party?.id ?? '');
  const { mutate: toggleBlock, isPending: togglingBlock } = useToggleUserBlock();

  const messages = messagesPage?.items ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (conversationLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  if (conversationError || !conversation || !party) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">تعذّر تحميل المحادثة</p>
        <Link href={ROUTES.messages} className="text-sm text-primary hover:underline">
          العودة للمحادثات
        </Link>
      </div>
    );
  }

  const avatar = getAvatarUrl(party.avatarUrl ?? '', 40);

  function handleToggleBlock() {
    if (!party) return;
    // Unblocking needs no confirmation (reversible, low-stakes); only
    // blocking — which also cuts off this thread — is confirmed first.
    if (isBlocked) {
      toggleBlock(party.id);
    } else {
      setConfirmBlockOpen(true);
    }
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-2 border-b p-3">
        <Link href={ROUTES.messages} className="lg:hidden text-muted-foreground">
          <ChevronRight className="h-5 w-5" />
        </Link>
        <div className="relative w-9 h-9 rounded-full overflow-hidden bg-muted shrink-0">
          <Image src={avatar} alt={party.name} fill className="object-cover" sizes="36px" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm line-clamp-1">{party.name}</p>
          {conversation.ad && (
            <p className="text-xs text-muted-foreground line-clamp-1">{conversation.ad.title}</p>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted"
              aria-label="خيارات المحادثة"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={togglingBlock}
              onClick={handleToggleBlock}
              className={cn(
                'flex items-center gap-2 cursor-pointer',
                !isBlocked && 'text-destructive focus:text-destructive'
              )}
            >
              {isBlocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
              {isBlocked ? 'إلغاء حظر المستخدم' : 'حظر المستخدم'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messagesLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : messages.length === 0 ? (
          <EmptyState
            className="py-8"
            title="ابدأ المحادثة"
            description="أرسل أول رسالة لبدء الحديث"
          />
        ) : (
          messages.map((message) => {
            const isMine = message.senderId === user?.id;
            return (
              <div key={message.id} className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                    // FIX BUG-XX: rounded-br-sm/rounded-bl-sm are physical
                    // (bottom-right/bottom-left) in a dir="rtl" app
                    // (app/layout.tsx), so the "pointed" corner sat on the
                    // wrong side of the bubble. rounded-ee-sm/rounded-es-sm
                    // are logical (bottom-end/bottom-start) and follow the
                    // actual text direction instead.
                    isMine
                      ? 'bg-primary text-primary-foreground rounded-ee-sm'
                      : 'bg-muted rounded-es-sm'
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p
                    className={cn(
                      'mt-1 text-[10px]',
                      isMine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}
                  >
                    {formatTime(message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <MessageInput conversationId={conversationId} disabled={isBlocked} />

      <ConfirmDialog
        open={confirmBlockOpen}
        onOpenChange={setConfirmBlockOpen}
        title={`حظر ${party.name}؟`}
        description="لن يتمكن هذا المستخدم من مراسلتك، ولن تتمكن من مراسلته حتى تلغي الحظر."
        confirmLabel="حظر"
        destructive
        isPending={togglingBlock}
        onConfirm={() =>
          toggleBlock(party.id, { onSuccess: () => setConfirmBlockOpen(false) })
        }
      />
    </div>
  );
}
