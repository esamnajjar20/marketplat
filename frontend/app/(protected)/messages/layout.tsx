'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';

const ConversationList = dynamic(
  () =>
    import('@/components/messages/ConversationList').then(
      (module) => module.ConversationList,
    ),
  { loading: () => <div className="flex justify-center py-12"><LoadingSpinner /></div> },
);

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const selectedId = params?.id;
  const isInboxRoute = !selectedId;

  const heightClass = isInboxRoute
    ? '-mb-20 h-[calc(100dvh-4rem)] md:mb-0 md:h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-7rem)]'
    : 'h-[100dvh] min-h-0';

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden md:flex-row md:gap-0 md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm', heightClass)}>
      <aside
        className={cn(
          'md:flex md:w-[15rem] md:shrink-0 md:flex-col md:overflow-hidden md:border-e md:border-border lg:w-[18rem]',
          isInboxRoute ? 'block' : 'hidden',
          'md:block'
        )}
      >
        <div className="space-y-3 p-3 sm:p-4 md:p-0 md:space-y-0 md:flex md:flex-col md:h-full md:min-h-0">
          <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
            <ConversationList selectedId={selectedId} />
          </Suspense>
        </div>
      </aside>

      <div className={cn('min-w-0 md:flex-1 md:min-h-0', isInboxRoute ? 'hidden md:block' : 'flex h-full flex-col')}>
        {children}
      </div>
    </div>
  );
}
