'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Heart, MessageCircle, Menu } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;

/**
 * FIX P1-3: mobile navigation previously relied entirely on the
 * hamburger drawer (MobileNav/ProtectedMobileNav) — every common
 * destination (home, search, favorites, messages) required opening the
 * drawer first instead of a direct tap, adding friction to every mobile
 * session. Adds a fixed 5-item bottom bar below `md`, following the
 * same "primary destinations always reachable, everything else in the
 * drawer" split the audit asked for.
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
 */
export function BottomNav() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const toggleMobileNav = useUIStore(selectToggleMobileNav);

  const items = [
    { label: 'الرئيسية', href: ROUTES.home, icon: Home },
    { label: 'البحث', href: ROUTES.search, icon: Search },
    // Favorites requires an account either way (see ROUTES.favorites'
    // own (protected) route group) — for a guest this still routes
    // correctly to /login?from=/favorites via ProtectedLayout's own
    // redirect, so no extra branching needed here.
    { label: 'المفضلة', href: ROUTES.favorites, icon: Heart },
    { label: 'الرسائل', href: ROUTES.messages, icon: MessageCircle },
  ] as const;

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="pwa-safe-bottom fixed inset-x-0 bottom-0 z-50 flex border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      {items.map(({ label, href, icon: Icon }) => {
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
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={toggleMobileNav}
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        {isAuthenticated ? 'حسابي' : 'القائمة'}
      </button>
    </nav>
  );
}
