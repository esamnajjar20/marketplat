'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, MessageCircle, Menu, Plus } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;

/**
 * FIX P1-3: mobile navigation previously relied entirely on the
 * hamburger drawer (MobileNav/ProtectedMobileNav) — every common
 * destination (home, search, favorites, messages) required opening the
 * drawer first instead of a direct tap, adding friction to every mobile
 * session. Adds a fixed bottom bar below `md`, following the same
 * "primary destinations always reachable, everything else in the
 * drawer" split the audit asked for.
 *
 * BUG FIX: removed "المفضلة" (favorites) from this bar per request —
 * bar is now 5 items total (home, search, +create, messages, menu).
 * Favorites remains reachable via the drawer (MobileNav/
 * ProtectedMobileNav already list it) and via ProtectedSidebar on
 * desktop — this only removes its bottom-bar shortcut.
 *
 * Deliberately reuses ui.store's existing isMobileNavOpen/toggleMobileNav
 * for its own "القائمة" tab instead of introducing a second drawer state
 * — tapping it opens the exact same drawer (MobileNav or
 * ProtectedMobileNav, whichever is mounted in the current layout) the
 * header's hamburger button already controls.
 *
 * Not mounted in (admin) — the admin section is a desktop-oriented
 * back-office tool (tables, bulk actions), not part of the consumer
 * mobile experience this fixes.
 *
 * pwa-safe-bottom (globals.css) handles the iOS home-indicator / Android
 * gesture-bar safe area — see that utility's own comment, which already
 * anticipated "Bottom navigation" as a consumer.
 *
 * P1 FIX (layout audit §9): "نشر إعلان" — the site's single most
 * important conversion action — had no direct entry point in this bar;
 * reaching it required hamburger → drawer → scroll to the "أضف إعلانك"
 * link. It's now a raised center button (common "post/create" pattern
 * on tabbed-navigation apps), splitting the remaining nav items around
 * it. /ads/create lives under (protected), so ProtectedLayout's own
 * auth-redirect handles guests the same way it already does for other
 * protected destinations — no extra branching needed here either.
 */
export function BottomNav() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const toggleMobileNav = useUIStore(selectToggleMobileNav);
  // SELLER-GATE: /ads/create requires a SellerProfile server-side
  // (ads.service.ts's createAd) — hook internally gates its query on
  // isAuthenticated, so this issues no request for guests. Mirrors
  // ProtectedHeader's identical swap: seller → post button,
  // non-seller → seller-signup CTA, guest → falls through to
  // /ads/create's own auth-redirect same as before this fix.
  const { data: sellerProfile, isSuccess: sellerLoaded } = useMySellerProfile();
  const isSeller = sellerLoaded && Boolean(sellerProfile);

  const leadingItems = [
    { label: 'الرئيسية', href: ROUTES.home, icon: Home },
    { label: 'البحث', href: ROUTES.search, icon: Search },
  ] as const;

  const trailingItems = [
    { label: 'الرسائل', href: ROUTES.messages, icon: MessageCircle },
  ] as const;

  function renderItem({ label, href, icon: Icon }: {
    label: string; href: string; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  }) {
    const isActive = href === ROUTES.home ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden={true} />
        {label}
      </Link>
    );
  }

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="pwa-safe-bottom fixed inset-x-0 bottom-0 z-50 flex items-center border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      {leadingItems.map(renderItem)}

      <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
        <Link
          href={isAuthenticated && !isSeller ? ROUTES.settings.seller : ROUTES.adCreate}
          className="-mt-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          <Plus className="h-5 w-5" aria-hidden={true} />
        </Link>
        {/* Label added to match the other four items' icon+label
            pattern — this button was the only one in the bar with no
            visible text, breaking visual consistency with its
            siblings. */}
        <span className="text-[11px] font-medium text-muted-foreground">
          {isAuthenticated && !isSeller ? 'أنشئ حساب بائع' : 'نشر إعلان'}
        </span>
      </div>

      {trailingItems.map(renderItem)}

      <button
        type="button"
        onClick={toggleMobileNav}
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Menu className="h-5 w-5" aria-hidden={true} />
        {isAuthenticated ? 'حسابي' : 'القائمة'}
      </button>
    </nav>
  );
}
