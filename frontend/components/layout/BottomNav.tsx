'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, MessageCircle, Menu, Plus } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ExploreSheet } from '@/components/layout/ExploreSheet';
import { CreateSheet } from '@/components/layout/CreateSheet';

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
 * bar is now 5 items total (home, استكشاف, +create, messages, menu).
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
 *
 * CREATE-SHEET FIX: the center button no longer jumps straight to
 * /ads/create — with products (stores) and services (providers) now
 * equally first-class listing types, a single-destination button
 * buried the other two. Tapping "+" opens CreateSheet (see its own
 * doc), which lists all three; each destination page is already
 * gated (CreateAdGate/CreateProductGate/CreateServiceListingGate), so
 * this bar no longer needs its own isSeller lookup just to pick a
 * link/label — the gate on the destination page handles "you need a
 * seller/store/provider profile first" itself.
 *
 * AUDIT-FIX ("Bottom Nav بيدفن 3 من 4 أقسام رئيسية"): "البحث" replaced
 * with "استكشاف", which opens ExploreSheet — a single entry point for
 * الإعلانات/المنتجات/الخدمات/المتاجر/مقدمو الخدمة (plus a plain
 * "بحث شامل" so the old direct-search shortcut isn't lost, just moved
 * one tap deeper). Rejected alternative: adding "الخدمات"/"المتاجر"/
 * "مقدمو الخدمة" as three more bottom-bar icons — a 5-slot mobile bar
 * has no room for 3 more without crowding it past usability. See
 * ExploreSheet's own doc for the full per-link routing rationale.
 */
export function BottomNav() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const toggleMobileNav = useUIStore(selectToggleMobileNav);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const leadingItems = [
    { label: 'الرئيسية', href: ROUTES.home, icon: Home },
  ] as const;

  const trailingItems = [
    { label: 'الرسائل', href: ROUTES.messages, icon: MessageCircle },
  ] as const;

  // "استكشاف" reads as active on any of the destinations its own sheet
  // links to (see ExploreSheet), not just /search itself — otherwise
  // landing on /stores or /service-providers via a direct link would
  // leave the whole bottom bar showing no active tab at all.
  const EXPLORE_ACTIVE_PREFIXES = [
    ROUTES.search, ROUTES.products, ROUTES.services, ROUTES.stores, ROUTES.serviceProviders,
  ] as const;
  const isExploreActive = EXPLORE_ACTIVE_PREFIXES.some((href) => pathname.startsWith(href));

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
          'relative flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] py-2 text-[11px] font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="relative inline-flex">
          <Icon className="h-5 w-5" aria-hidden={true} />
          {isActive && (
            <span className="absolute -bottom-1 start-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" aria-hidden />
          )}
        </span>
        {label}
      </Link>
    );
  }

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="pwa-safe-bottom fixed inset-x-0 bottom-0 z-50 flex items-center border-t border-border/80 bg-background/95 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-background/85 md:hidden"
    >
      {leadingItems.map(renderItem)}

      <button
        type="button"
        onClick={() => setExploreOpen(true)}
        aria-current={isExploreActive ? 'page' : undefined}
        aria-haspopup="dialog"
        className={cn(
          'relative flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] py-2 text-[11px] font-medium transition-colors',
          isExploreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span className="relative inline-flex">
          <Compass className="h-5 w-5" aria-hidden={true} />
          {isExploreActive && (
            <span className="absolute -bottom-1 start-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" aria-hidden />
          )}
        </span>
        استكشاف
      </button>

      <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-haspopup="dialog"
          className="-mt-5 flex h-14 w-14 min-h-[48px] min-w-[48px] items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105 hover:shadow-lg"
        >
          <Plus className="h-5 w-5" aria-hidden={true} />
        </button>
        {/* Label added to match the other four items' icon+label
            pattern — this button was the only one in the bar with no
            visible text, breaking visual consistency with its
            siblings. */}
        <span className="text-[11px] font-medium text-muted-foreground">أضف</span>
      </div>

      {trailingItems.map(renderItem)}

      <button
        type="button"
        onClick={toggleMobileNav}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Menu className="h-5 w-5" aria-hidden={true} />
        {isAuthenticated ? 'حسابي' : 'القائمة'}
      </button>

      <ExploreSheet open={exploreOpen} onOpenChange={setExploreOpen} />
      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </nav>
  );
}
