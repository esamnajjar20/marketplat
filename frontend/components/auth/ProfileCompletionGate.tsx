'use client';

/**
 * ProfileCompletionGate — FEAT-GOOGLE-COMPLETE-PROFILE.
 *
 * Mounted once at the root (AppProviders), same posture as
 * PresenceHeartbeat/PageViewTracker: no props, no visible output.
 *
 * authController.googleCallback (backend) already redirects a
 * brand-new Google signup straight to /complete-profile on the very
 * first page load, so in the common case this component has nothing
 * to do. It exists for every case that redirect can't cover:
 *   - the user closes the tab on /complete-profile and comes back
 *     later via a bookmark/history entry — AuthHydrationProvider's
 *     /users/me fetch repopulates needsProfileCompletion, and this
 *     component is what actually sends them back.
 *   - the user manually navigates elsewhere (address bar, back
 *     button) before submitting the form.
 *
 * Deliberately a client-side check (like ProtectedLayout's own
 * belt-and-suspenders guard) rather than an addition to
 * middleware.ts's Edge logic: needsProfileCompletion only ever
 * matters for a small, short-lived slice of accounts right after
 * signup, and reading it requires the full user object this app only
 * has client-side (via the Zustand store) — mirroring it into a
 * middleware-readable cookie for this one edge case wasn't worth the
 * added cookie/trust-model surface next to app_user_role's existing
 * one. No API call bypass either way: every real POST/
 * goes through the backend regardless of what page is showing.
 */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';

export function ProfileCompletionGate() {
  const user = useAuthStore(selectUser);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated || !user?.needsProfileCompletion) return;
    if (pathname === ROUTES.completeProfile) return;
    router.replace(ROUTES.completeProfile);
  }, [isAuthenticated, user?.needsProfileCompletion, pathname, router]);

  return null;
}
