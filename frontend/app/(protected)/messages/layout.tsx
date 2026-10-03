/**
 * (protected)/messages/layout.tsx — DESKTOP-SPLIT-01.
 *
 * Previously /messages (inbox) and /messages/:id (thread) were two
 * fully separate full-screen routes with no layout between them and
 * (protected)/layout.tsx. Correct on mobile — a chat app should go
 * full-screen per thread there — but on desktop it meant opening any
 * conversation threw away the entire inbox list, unlike every
 * comparable chat UI at this viewport (WhatsApp Web, Telegram Web,
 * Gmail's own thread-list-plus-reading-pane pattern). ChatWindow's
 * back-button already carried a stray sm:hidden with nothing sized to
 * hide it for — a leftover expectation of exactly this layout that
 * was never actually built.
 *
 * At >=md this renders ConversationList in a fixed left column
 * (this app is RTL — inline-start is the visual left in the LTR sense
 * flipped, i.e. still "first" in DOM/flex order) beside {children}
 * (either /messages' empty state or /messages/:id's ChatWindow) in a
 * right column, both inside one shared bordered frame so the two
 * panes read as a single unit rather than two stacked cards.
 *
 * Below md this renders only {children} — no sidebar, no shared
 * frame — identical to how these two routes behaved before this file
 * existed. That's deliberate: full-screen-per-thread is the correct
 * mobile pattern already, this file's only job is adding the desktop
 * case that was missing, not changing the mobile one.
 *
 * ONE ConversationList, not two: mounting it once here (rather than
 * once here for >=md and again inside /messages' page.tsx for <lg)
 * avoids a duplicate useMyConversations poll running for the same
 * data. usePathname decides the rest — on the bare /messages route
 * (no thread open yet) the list is also shown full-width below md via
 * the isInboxRoute branch; once a thread is open (/messages/:id)
 * below md it hides entirely so ChatWindow's own full-screen view
 * (already handling its own back button) isn't fighting a second
 * nav element for the same space.
 */
'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { ConversationList } from '@/components/messages/ConversationList';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInboxRoute = pathname === ROUTES.messages;
  // /messages/:id → that id; /messages itself → undefined (nothing to
  // highlight, matches ConversationList's own selectedId contract).
  const selectedId = isInboxRoute ? undefined : pathname.split('/').pop();

  return (
    <div className="md:flex md:h-[calc(100dvh-6.5rem)] md:gap-0 md:overflow-hidden md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm lg:h-[calc(100dvh-7rem)]">
      <aside
        className={cn(
          'md:flex md:w-[15rem] md:shrink-0 md:flex-col md:overflow-hidden md:border-e md:border-border lg:w-[18rem]',
          isInboxRoute ? 'block' : 'hidden',
          'md:block'
        )}
      >
        <div className="space-y-3 p-3 sm:p-4 md:p-0 md:space-y-0 md:flex md:flex-col md:h-full md:min-h-0">
          <div className="md:hidden flex items-center justify-between gap-2 px-1">
            <h1 className="text-xl font-bold tracking-tight">الرسائل</h1>
          </div>
          <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
            <ConversationList selectedId={selectedId} />
          </Suspense>
        </div>
      </aside>

      <div className={cn('min-w-0 md:flex-1 md:min-h-0', isInboxRoute ? 'hidden md:block' : 'block')}>
        {children}
      </div>
    </div>
  );
}
