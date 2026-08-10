/**
 * /admin — root alias, redirects to /admin/dashboard.
 *
 * REORG-09: every in-app entry point (UserMenu, MobileNav,
 * ProtectedMobileNav) already links straight to ROUTES.admin.dashboard,
 * so this route was never hit by normal navigation — but it also never
 * had a page.tsx, so typing /admin directly (bookmark, address bar,
 * external link) 404'd. Same pattern as the /ads/[id]/edit legacy
 * redirect: a bare forwarding page, not new content.
 *
 * Server-side redirect (no params, no client state needed) rather than
 * a useEffect round-trip.
 */
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants';

export default function AdminRootPage() {
  redirect(ROUTES.admin.dashboard);
}
