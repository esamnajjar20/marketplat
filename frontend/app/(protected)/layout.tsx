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
  selectIsAuthenticated,
  selectIsHydrated,
  selectIsAuthResolving,
} from '@/store/auth.store';
import { ProtectedHeader }  from '@/components/layout/ProtectedHeader';
import { ProtectedSidebar } from '@/components/layout/ProtectedSidebar';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isHydrated      = useAuthStore(selectIsHydrated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  const router          = useRouter();
  const pathname        = usePathname();

  // FIX AUTH-04: don't make any auth decision until both hydration AND
  // (if applicable) the async session-restore flow have completed.
  const isResolved = isHydrated && !isAuthResolving;

  useEffect(() => {
    if (!isResolved) return;
    if (!isAuthenticated) {
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthenticated, isResolved, router, pathname]);

  // Show skeleton while waiting for hydration or session restoration.
  if (!isResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Don't flash protected content before redirect fires.
  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <ProtectedHeader />
      <div className="flex flex-1">
        <ProtectedSidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
