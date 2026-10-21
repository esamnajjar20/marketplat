'use client';

/**
 * Admin layout.
 *
 * / T-08: Role check uses useAuthStore (client-side),
 *                   NOT the JWT payload (which doesn't contain role).
 *                   Middleware provides a first layer of protection via the
 *                   app_user_role cookie; this layout is the second layer.
 *
 * waits for isAuthResolving to settle (not just isHydrated)
 *              before making any redirect decision — see ProtectedLayout
 *              for the full explanation of the false-logout race this 
 *
 * Non-admin authenticated users → redirect to /dashboard (not /login).
 */

import { Suspense, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { toast }        from 'sonner';
import {
  useAuthStore,
  selectUser,
  selectIsAuthenticated,
  selectIsAdminTier,
  selectIsHydrated,
  selectIsAuthResolving,
} from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';

import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminHeader }  from '@/components/admin/AdminHeader';
import { PageTransition } from '@/components/shared/PageTransition';
import { SessionRestorationStatus } from '@/components/shared/SessionRestorationStatus';
import { SessionRestoreStalled } from '@/components/shared/SessionRestoreStalled';
import { useAuthRestoreRetry } from '@/hooks/useAuthRestoreRetry';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { signalNavigationStart } from '@/components/shared/NavigationProgress';

// Gap #20 (admin permission tiers) / ADMIN-HUB-01: every admin section is a tab
// of the /admin hub now, so the page-level gate only has to admit the hub
// itself; WHICH tabs a MODERATOR may open is decided in lib/adminHubTabs.ts and
// enforced by AdminTabsHub (and, for real, by the backend's requireMinRole).
// Anything else under /admin (e.g. /admin/debug/warming) is ADMIN-only.
function isAllowedForModerator(pathname: string): boolean {
  return pathname === ROUTES.admin.root;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user             = useAuthStore(selectUser);
  // Gap #20 (admin permission tiers): admits any admin-tier role
  // (MODERATOR/ADMIN/SUPER_ADMIN) into the layout shell. Which pages
  // and actions a given role can actually reach within it is narrowed
  // below (MODERATOR_ALLOWED_PREFIXES) and enforced for real by the
  // backend (requireMinRole) — this check stays what it always was:
  // routing convenience, not the security boundary.
  const isAdminTier     = useAuthStore(selectIsAdminTier);
  const isHydrated      = useAuthStore(selectIsHydrated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  const router          = useRouter();
  const pathname        = usePathname();

  const isResolved  = isHydrated && !isAuthResolving;
  const isOnline    = useOnlineStatus();
  // FIX AUTH-SLOW-RESTORE-01: see (protected)/layout.tsx. Persisted user kept +
  // online + unauthenticated == refresh got no server answer, not a logout.
  const restoreStalled = isResolved && !isAuthenticated && isOnline && user != null;
  const { retry: retryRestore, retrying: isRetryingRestore } = useAuthRestoreRetry(restoreStalled);
  const isModerator = user?.role === 'MODERATOR';
  // A MODERATOR on a page outside their allowed sections (typed URL,
  // stale link, a page that existed before this feature) — same
  // "explain, don't silently bounce" treatment as the non-admin case
  // below, just scoped to a narrower target (/admin/ads) instead of
  // /dashboard, since a MODERATOR does belong in the admin panel.
  const isOutOfScopeForModerator = isModerator && !isAllowedForModerator(pathname);

  useEffect(() => {
    if (!isResolved) return;
    if (restoreStalled) return;
    if (!isAuthenticated) {
      // keep the current admin tab (?tab=…) across login.
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const destination = `${ROUTES.login}?from=${encodeURIComponent(ROUTES.admin.root + search)}`;
      signalNavigationStart(destination);
      router.replace(destination);
      return;
    }
    if (!isAdminTier) {
      // AUDIT-FIX (admin #3): was a fully silent redirect — a signed-in
      // non-admin landing on /admin/* (mistyped URL, curiosity, a stale
      // link) was bounced to /dashboard with zero feedback, unable to
      // tell whether the link was broken or they simply lacked access.
      // The redirect itself was never the problem (the actual
      // protection is correct); only the missing explanation was.
      toast.error('هذه الصفحة مخصصة للمشرفين فقط');
      signalNavigationStart(ROUTES.dashboard);
      router.replace(ROUTES.dashboard);
      return;
    }
    if (isOutOfScopeForModerator) {
      toast.error('هذا القسم غير متاح لدور المشرف المساعد');
      signalNavigationStart(ROUTES.admin.ads);
      router.replace(ROUTES.admin.ads);
    }
  }, [isAuthenticated, isAdminTier, isOutOfScopeForModerator, isResolved, restoreStalled, router]);

  if (!isResolved) {
    return <SessionRestorationStatus />;
  }

  if (restoreStalled) {
    return (
      <SessionRestoreStalled
        retrying={isRetryingRestore}
        onRetry={() => { void retryRestore(); }}
        onLogin={() => {
          useAuthStore.getState().logout();
          router.replace(`${ROUTES.login}?from=${encodeURIComponent(ROUTES.admin.root)}`);
        }}
      />
    );
  }

  if (!isAuthenticated || !isAdminTier || isOutOfScopeForModerator) {
    return <SessionRestorationStatus message="جارٍ توجيهك إلى الصفحة المناسبة…" />;
  }

  return (
    <div className="flex min-h-screen min-h-dvh bg-surface-1">
      {/* useSearchParams() inside needs a Suspense boundary. */}
      <Suspense fallback={<div className="w-12 shrink-0" aria-hidden="true" />}><AdminSidebar /></Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader />
        {/* DESKTOP-AUDIT-02: id targeted by the root layout's SkipLink. */}
        <main id="main-content" className="flex-1 overflow-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1600px]">
            <PageTransition>{children}</PageTransition>
          </div>
        </main>
      </div>
    </div>
  );
}
