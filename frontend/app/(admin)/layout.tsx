/**
 * Admin layout.
 *
 * FIX C-04 / T-08: Role check uses useAuthStore (client-side),
 *                   NOT the JWT payload (which doesn't contain role).
 *                   Middleware provides a first layer of protection via the
 *                   app_user_role cookie; this layout is the second layer.
 *
 * FIX AUTH-04: waits for isAuthResolving to settle (not just isHydrated)
 *              before making any redirect decision — see ProtectedLayout
 *              for the full explanation of the false-logout race this fixes.
 *
 * Non-admin authenticated users → redirect to /dashboard (not /login).
 */
'use client';

import { useEffect }    from 'react';
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

// Gap #20 (admin permission tiers): the only two sections a MODERATOR
// can reach — mirrors AdminSidebar's own tierRequired filter and the
// backend's requireMinRole(MODERATOR) gate on ads/reports/fraud.
// Kept as prefixes (not exact matches) so nested routes like
// /admin/ads/123 are covered too.
const MODERATOR_ALLOWED_PREFIXES = [
  ROUTES.admin.root,
  ROUTES.admin.ads,
  ROUTES.admin.reports,
  ROUTES.admin.fraud,
  ROUTES.admin.products,
  ROUTES.admin.serviceListings,
  ROUTES.admin.serviceBroadcasts,
];

function isAllowedForModerator(pathname: string): boolean {
  if (pathname === ROUTES.admin.root) return true;
  return MODERATOR_ALLOWED_PREFIXES.some(
    (prefix) => prefix !== ROUTES.admin.root && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
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
  const isModerator = user?.role === 'MODERATOR';
  // A MODERATOR on a page outside their allowed sections (typed URL,
  // stale link, a page that existed before this feature) — same
  // "explain, don't silently bounce" treatment as the non-admin case
  // below, just scoped to a narrower target (/admin/ads) instead of
  // /dashboard, since a MODERATOR does belong in the admin panel.
  const isOutOfScopeForModerator = isModerator && !isAllowedForModerator(pathname);

  useEffect(() => {
    if (!isResolved) return;
    if (!isAuthenticated) {
      router.replace('/login?from=/admin');
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
      router.replace('/dashboard');
      return;
    }
    if (isOutOfScopeForModerator) {
      toast.error('هذا القسم غير متاح لدور المشرف المساعد');
      router.replace(ROUTES.admin.ads);
    }
  }, [isAuthenticated, isAdminTier, isOutOfScopeForModerator, isResolved, router]);

  if (!isResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdminTier || isOutOfScopeForModerator) return null;

  return (
    <div className="flex min-h-screen bg-surface-1">
      <AdminSidebar />
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
