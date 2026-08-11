/**
 * PublicHeader — top navigation for all public-facing pages.
 *
 * Contains: Logo, main nav links, search bar, auth buttons (or user menu).
 * Responsive: collapses to a hamburger menu on mobile.
 */
'use client';

import Link from 'next/link';
import { Logo }           from './Logo';
import { SearchBar }      from './SearchBar';
import { UserMenu }       from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle }    from './ThemeToggle';
import { MobileNav }      from './MobileNav';
import { Button }         from '@/components/shared/ui/Button';
import { ROUTES }         from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

export function PublicHeader() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return (
    <header className="pwa-safe-top sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* VISUAL (mobile top-bar redesign): a dedicated compact title
          row for < md, replacing the cramped single h-16 row that used
          to squeeze the logo, bell and hamburger together with no
          search bar (search only appeared in the second row below).
          Mirrors the reference layout's title bar — small centered
          brand mark, bell kept unconditionally reachable next to it —
          while staying on the same theme tokens as the rest of the
          header so it needs no separate dark-mode treatment. */}
      <div className="flex h-14 items-center justify-between px-4 md:hidden">
        <Link href={ROUTES.home} className="shrink-0">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {isAuthenticated && <NotificationBell />}
          <MobileNav />
        </div>
      </div>

      <div className="container mx-auto hidden h-16 max-w-7xl items-center gap-4 px-4 md:flex">
        <Link href={ROUTES.home} className="shrink-0">
          <Logo />
        </Link>

        {/* AUDIT-FIX (issue #3 — 🔴 critical): the stores/services/
            service-providers modules were fully built end-to-end
            (API, hooks, pages) but had zero entry point from primary
            navigation anywhere in the app — a user could never
            discover them without typing the URL directly. These three
            links are that missing entry point, placed where a returning
            user already expects site sections: between the logo and
            the search bar. */}
        <nav className="hidden items-center gap-1 lg:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href={ROUTES.stores}>المتاجر</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={ROUTES.services}>الخدمات</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={ROUTES.serviceProviders}>مقدمو الخدمة</Link>
          </Button>
        </nav>

        <div className="hidden flex-1 md:block">
          <SearchBar />
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {/* FIX UX-03: theme is a device preference, not tied to an
              account — sits outside the isAuthenticated branch so
              guests can switch it too, not just logged-in users. */}
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              {/* P1 FIX (layout audit §9): this is the site's primary
                  conversion CTA (matches ProtectedHeader's "+ نشر إعلان"),
                  but was rendered as a ghost button here — the opposite
                  of what its importance calls for, and inconsistent with
                  its own prominent treatment once the user is signed in. */}
              <Button asChild size="sm">
                <Link href={ROUTES.adCreate}>نشر إعلان</Link>
              </Button>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={ROUTES.login}>تسجيل الدخول</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={ROUTES.register}>إنشاء حساب</Link>
              </Button>
            </>
          )}
        </nav>
      </div>

      {/* Mobile search bar — kept as its own row (not merged into the
          title row above) since the title row's job is brand + quick
          actions (theme/bell/menu), while search needs its full
          width to stay comfortably tappable. */}
      <div className="border-t px-4 py-2 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}
