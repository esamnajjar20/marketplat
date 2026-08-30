/**
 * PublicHeader — top navigation for all public-facing pages.
 *
 * Contains: Logo, main nav links, search bar, auth buttons (or user menu).
 * Responsive: collapses to a hamburger menu on mobile.
 */
'use client';

import { useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo }           from './Logo';
import { SearchBar }      from './SearchBar';
import { UserMenu }       from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { MessagesLink } from './MessagesLink';
import { ThemeToggle }    from './ThemeToggle';
import { MobileNav }      from './MobileNav';
import { CreateSheet } from './CreateSheet';
import { Plus } from 'lucide-react';
import { Button }         from '@/components/shared/ui/Button';
import { ROUTES }         from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

interface Props {
  /**
   * UX-FIX: reported that login/register/etc. show a full search bar
   * they have no use for — a visitor mid-auth-flow isn't browsing
   * listings. Defaults true (every existing call site keeps its
   * current behavior); (auth)/layout.tsx is the only caller passing
   * false. Kept as an explicit prop rather than a pathname check
   * inside this component (the existing onSearchPage pattern below)
   * since PublicHeader shouldn't need to know about (auth)'s specific
   * routes — the call site that knows it's the auth layout says so.
   */
  showSearch?: boolean;
}

export function PublicHeader({ showSearch = true }: Props = {}) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const [createOpen, setCreateOpen] = useState(false);
  // FIX UI-REVIEW-SEARCH-DUP: /search renders its own SearchBox in a
  // dedicated brand band right below this header (see
  // app/(public)/search/page.tsx) — a more capable control on that
  // page specifically (query suggestions dropdown, preserves the
  // page's existing city/type/sort/category filters on submit,
  // matching SearchFilters' own update() convention) rather than a
  // plain duplicate. With this header's own SearchBar still rendered
  // unconditionally too, every visitor to /search saw two full-width
  // search fields stacked directly on top of each other doing
  // functionally the same thing — reported as a literal duplicate
  // input, not just a visual near-miss. Hiding this header's copy
  // specifically on /search (its result subpages like /search?q=...
  // still match, since ROUTES.search has no trailing segment here)
  // rather than touching SearchBox/SearchBar's own behavior, since
  // both remain correct, distinct components used correctly in every
  // other context (SearchBar also drives HeroBanner's desktop search).
  const pathname = usePathname();
  const onSearchPage = pathname === ROUTES.search;

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

        {/* FIX HEADER-01: was `lg:flex` while every sibling in this row
            (this whole container, the search bar below, the auth/menu
            nav) all gate on `md:flex` — the mismatch left a dead zone
            between 768px and 1023px (tablets, split-screen desktop
            windows) where this row of nav appears "desktop" (logo +
            search + auth all visible) but Stores/Services/Service
            Providers silently vanish with zero fallback, since
            MobileNav itself is md:hidden at that width. Matches the
            container's own md:flex so the whole row turns on together. */}
        <nav className="hidden items-center gap-1 md:flex">
          {/* NAV-GAP FIX: ads previously had no standing nav link here
              (only reachable via Home's CTA or the /search type tab) —
              see lib/navigation.ts's BROWSE_LINKS comment for the full
              reasoning. Hand-written here rather than mapped from
              BROWSE_LINKS since this header's desktop nav has always
              been its own literal list, not sourced from that shared
              array (only the mobile drawers read BROWSE_LINKS). */}
          <Button asChild variant="ghost" size="sm" className="transition-colors">
            <Link href={`${ROUTES.search}?type=ads`}>الإعلانات</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="transition-colors">
            <Link href={ROUTES.stores}>المتاجر</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="transition-colors">
            <Link href={ROUTES.services}>الخدمات</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="transition-colors">
            <Link href={ROUTES.serviceProviders}>مقدمو الخدمة</Link>
          </Button>
        </nav>

        <div className="hidden flex-1 md:block">
          {!onSearchPage && showSearch && <SearchBar />}
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
              <Button type="button" size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                أضف
              </Button>
              <MessagesLink />
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <>
              <Button type="button" size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                أضف
              </Button>
              <Button asChild variant="ghost" size="sm" className="transition-colors">
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
          width to stay comfortably tappable. Hidden on /search itself
          for the same reason as the desktop copy above — see this
          component's top-level comment. */}
      {!onSearchPage && showSearch && (
        <div className="border-t px-4 py-2 md:hidden">
          <SearchBar />
        </div>
      )}
          <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </header>
  );
}
