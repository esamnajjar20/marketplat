/**
 * Epic 5: replaces the redirect-to-/messages stub described in this
 * file's own pre-Epic-5 comment ("لا يوجد Conversation/
 * Message Prisma models") — that note is now stale; the conversations
 * module exists end-to-end, so this renders the real thread instead.
 *
 * DESKTOP-SPLIT-01: below lg (protected)/messages/layout.tsx renders
 * only {children} — this page — full-screen, same as before the split
 * view existed. ChatWindow itself stopped owning a height/frame (see
 * its own doc comment) so this wrapper is what actually sizes it here;
 * at >=lg, layout.tsx's pane provides that sizing instead and this
 * div's h-full simply fills it.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ChatWindow } from '@/components/messages/ChatWindow';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'المحادثة', noIndex: true });

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="h-[calc(100dvh-8rem)] lg:h-full rounded-lg border overflow-hidden lg:rounded-none lg:border-0">
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        {/* FIX CHAT-SWITCH-STATE-LEAK-01: key={id} forces React to
            unmount the previous ChatWindow instance and mount a fresh
            one when the user navigates from /messages/X to
            /messages/Y. Without it, React reuses the same component
            instance and its internal state — olderMessages (the
            "load older" accumulator), olderPage, retryingQueueId,
            confirmBlockOpen, confirmDeleteMessageId, partyTyping —
            survives the switch. The visible bug: after loading older
            messages in thread X and then opening thread Y, the
            ChatWindow rendered X's oldest messages as if they belonged
            to Y. Not an auth leak (the user is the same), but a real
            visual correctness bug that would be very confusing in an
            active conversation. key is React's documented idiom for
            "reset all state when this identity changes" — cleaner
            than adding a useEffect per state variable. */}
        <ChatWindow key={id} conversationId={id} />
      </Suspense>
    </div>
  );
}
