'use client';

import dynamic from 'next/dynamic';
import { Suspense, useSyncExternalStore } from 'react';
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

const DESKTOP_MESSAGES_QUERY = '(min-width: 768px)';

function subscribeToDesktopLayout(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const media = window.matchMedia(DESKTOP_MESSAGES_QUERY);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }

  // Safari versions without MediaQueryList.addEventListener.
  media.addListener(onChange);
  return () => media.removeListener(onChange);
}

function getDesktopLayoutSnapshot() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(DESKTOP_MESSAGES_QUERY).matches;
}

function getServerDesktopLayoutSnapshot() {
  return false;
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopLayout,
    getDesktopLayoutSnapshot,
    getServerDesktopLayoutSnapshot,
  );
  const params = useParams<{ id?: string }>();
  const selectedId = params?.id;
  const isInboxRoute = !selectedId;
  // On mobile a selected conversation replaces the inbox completely. Keep
  // the inbox list mounted only on the inbox route or where the desktop
  // split-view actually displays it; a CSS-hidden list must not fetch data.
  const shouldRenderConversationList = isInboxRoute || isDesktop;

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
        {shouldRenderConversationList && (
          <div className="space-y-3 p-3 sm:p-4 md:p-0 md:space-y-0 md:flex md:flex-col md:h-full md:min-h-0">
            <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
              <ConversationList selectedId={selectedId} />
            </Suspense>
          </div>
        )}
      </aside>

      <div className={cn('min-w-0 md:flex-1 md:min-h-0', isInboxRoute ? 'hidden md:block' : 'flex h-full flex-col')}>
        {children}
      </div>
    </div>
  );
}
