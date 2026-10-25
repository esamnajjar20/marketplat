import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ChatWindow } from '@/components/messages/ChatWindow';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'محادثة', noIndex: true });

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-0 rounded-none md:rounded-lg md:border lg:rounded-none lg:border-0">
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <ChatWindow conversationId={id} />
      </Suspense>
    </div>
  );
}
