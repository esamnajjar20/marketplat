/**
 * Epic 5: replaces the redirect-to-/messages stub described in this
 * file's own pre-Epic-5 FIX AUDIT-V4-03 comment ("لا يوجد Conversation/
 * Message Prisma models") — that note is now stale; the conversations
 * module exists end-to-end, so this renders the real thread instead.
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
    <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
      <ChatWindow conversationId={id} />
    </Suspense>
  );
}
