/**
 * Protected route layout.
 *
 * Blocks rendering until Zustand has hydrated from localStorage AND,
 * if a persisted session exists, until AuthHydrationProvider's async
 * refresh+/me flow has settled. If not authenticated after both have
 * resolved → redirect to /login?from=<pathname>.
 *
 * FIX AUTH-04: previously this only waited for isHydrated, which flips
 * true synchronously right after the localStorage read — long before
 * the async refresh-token exchange resolves. That left a real window
 * (worse under real-world latency) where a fully logged-in user with a
 * valid refreshToken was bounced to /login because isAuthenticated was
 * still false while the silent refresh was still in flight.
 *
 * FIX PERF-01: Blocking skeleton is only here (protected routes),
 *              not in the root AppProviders — public pages render freely.
 *
 * FIX H-1: This layout previously rendered only {children}, with no
 *          ProtectedHeader/ProtectedSidebar — unlike the sibling (public),
 *          (admin), and settings layouts, which all mount their own nav.
 *          That left /dashboard, /my-ads, and /favorites with no in-app
 *          navigation (browser back button only). Now mounted here, same
 *          pattern as (admin)/layout.tsx.
 */
'use client';

import { useEffect }    from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  useAuthStore,
  selectUser,
  selectIsAuthenticated,
  selectIsHydrated,
  selectIsAuthResolving,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ProtectedHeader }  from '@/components/layout/ProtectedHeader';
import { ProtectedSidebar } from '@/components/layout/ProtectedSidebar';
import { BottomNav }        from '@/components/layout/BottomNav';
import { PageTransition }   from '@/components/shared/PageTransition';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user             = useAuthStore(selectUser);
  const isHydrated      = useAuthStore(selectIsHydrated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  const isOnline        = useOnlineStatus();
  const router          = useRouter();
  const pathname        = usePathname();

  // FIX AUTH-04: don't make any auth decision until both hydration AND
  // (if applicable) the async session-restore flow have completed.
  const isResolved = isHydrated && !isAuthResolving;

  // FIX AUTH-OFFLINE-01: isAuthenticated can be false for two very
  // different reasons — (a) the backend genuinely rejected the session
  // (AuthHydrationProvider's logout() ran, which also clears the
  // persisted `user`), or (b) the device is offline and the session was
  // simply never re-verified this load (AuthHydrationProvider now
  // deliberately leaves `user` and isAuthenticated untouched on a
  // network failure — see that file). Only (a) should send someone to
  // /login; (b) has a perfectly good previously-authenticated user and
  // should render the cached shell instead, so a person who opens or
  // reloads /messages or /notifications while offline actually sees
  // their cached conversations/alerts instead of being bounced to a
  // login screen before the offline-cached content ever gets a chance
  // to render. The moment connectivity returns, the normal refresh flow
  // either confirms the session (isAuthenticated flips true, nothing
  // visibly changes) or genuinely rejects it (user is cleared, and this
  // same effect below redirects then — for real this time).
  const canRenderOffline = !isOnline && user != null;

  useEffect(() => {
    if (!isResolved) return;
    if (!isAuthenticated && !canRenderOffline) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, canRenderOffline, isResolved, router, pathname]);

  // Show skeleton while waiting for hydration or session restoration.
  if (!isResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Don't flash protected content before redirect fires.
  if (!isAuthenticated && !canRenderOffline) return null;

  return (
    // FIX OVERFLOW-01: this container and every flex child in the
    // chain below (the row div, <main>) were missing min-w-0. Default
    // flex-item min-width is `auto`, meaning a flex item never shrinks
    // narrower than its own content — so Timeline's 8-tab row (which
    // relies on its own overflow-x-auto to scroll internally) was
    // instead pushing <main>, this row, and this outer column wider
    // than the viewport. That page-level horizontal overflow is what
    // stretched the whole layout and clipped BottomNav's fixed
    // inset-x-0 items off the visible edge — not a BottomNav bug
    // itself. min-w-0 at each level lets children's own overflow
    // handling (Timeline's overflow-x-auto) actually take effect
    // instead of being bypassed by an ancestor refusing to shrink.
    <div className="flex min-h-screen min-w-0 flex-col">
      <ProtectedHeader />
      <div className="flex min-w-0 flex-1">
        <ProtectedSidebar />
        {/* FIX P1-3: pb-20 reserves space for BottomNav on mobile, same
            as the (public) layout's identical change (BottomNav is
            hidden md:, so md:pb-6 drops back to the normal scale).
            FIX UX-19: p-6 was flat (24px) on every viewport with no
            breakpoint variant — the doc's own recommendation is
            16px mobile scaling to 24–32px desktop. px-4 py-4 (16px)
            is the mobile base; md:p-6 (24px) and lg:p-8 (32px) scale
            it up, with pb-20/md:pb-6 layered on top for BottomNav. */}
        {/* DESKTOP-AUDIT-02: id targeted by the root layout's SkipLink. */}
        <main id="main-content" className="min-w-0 flex-1 px-4 py-4 pb-20 md:p-6 md:pb-6 lg:p-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
