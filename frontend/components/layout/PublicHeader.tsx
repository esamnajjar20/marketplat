'use client';

/**
 * PublicHeader — top navigation for all public-facing pages.
 *
 * Contains: Logo, main nav links, search bar, auth buttons (or user menu).
 * Responsive: collapses to a hamburger menu on mobile.
 */

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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
import { useAuthStore, selectHydratedIsAuthenticated } from '@/store/auth.store';

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
  // HYDRATION-SAFE: `mounted` becomes true only after the first commit,
    // so the first client render matches the server (anonymous). Zustand
    // persist rehydrates synchronously, so `isHydrated` alone is not enough.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isAuthenticated = mounted && useAuthStore(selectHydratedIsAuthenticated);
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
  // UI-REVIEW-HOME-SEARCH-DUP: the homepage renders its own SearchBox
  // inside HomeDiscoverHero — a richer control with quick-shortcut chips
  // (خدمات/منتجات/إعلانات/متاجر) that appear directly under the hero.
  // Without this guard, / (home) showed the same field twice: once in
  // this header, once in the hero. Hide the header copy on the homepage
  // only; every other public route keeps it (there is no hero SearchBox
  // anywhere else).
  const isHomePage = pathname === '/';
  const searchParams = useSearchParams();
  const isAdsBrowseActive = onSearchPage && (searchParams.get('type') ?? 'all') === 'ads';
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const navItemClass = (active: boolean) =>
    active
      ? 'bg-primary-soft text-primary shadow-xs hover:bg-primary-soft/80 hover:text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground';

  return (
    <header className="pwa-safe-top sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 shadow-xs backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      {/* VISUAL (mobile top-bar redesign): a dedicated compact title
          row for < md, replacing the cramped single h-16 row that used
          to squeeze the logo, bell and hamburger together with no
          search bar (search only appeared in the second row below).
          Mirrors the reference layout's title bar — small centered
          brand mark, bell kept unconditionally reachable next to it —
          while staying on the same theme tokens as the rest of the
          header so it needs no separate dark-mode treatment. */}
      <div className="flex h-14 items-center justify-between px-4 md:hidden">
        <Link prefetch={false} href={ROUTES.home} className="shrink-0">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {isAuthenticated && <NotificationBell />}
          <MobileNav />
        </div>
      </div>

      <div className="container mx-auto hidden min-h-16 max-w-7xl items-center gap-3 px-4 py-2 lg:gap-4 md:flex">
        <Link prefetch={false} href={ROUTES.home} className="shrink-0">
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
        <nav aria-label="التنقل العام" className="hidden items-center gap-1 rounded-xl border border-border/50 bg-surface-1/50 p-1 md:flex">
          {/* SPRINT-2-IA: desktop navigation now exposes the five primary
              discovery destinations consistently: search/explore, ads,
              products, services, and stores. Service providers remain
              reachable from the services surface and the shared Explore
              drawer instead of consuming a top-level slot. */}
          <Button asChild variant="ghost" size="sm" className={navItemClass(onSearchPage)}>
            <Link prefetch={false} href={ROUTES.search} aria-current={onSearchPage ? 'page' : undefined}>استكشاف</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className={navItemClass(isAdsBrowseActive)}>
            <Link prefetch={false} href={`${ROUTES.search}?type=ads`} aria-current={isAdsBrowseActive ? 'page' : undefined}>الإعلانات</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className={navItemClass(isActive(ROUTES.products))}>
            <Link prefetch={false} href={ROUTES.products} aria-current={isActive(ROUTES.products) ? 'page' : undefined}>المنتجات</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className={navItemClass(isActive(ROUTES.services))}>
            <Link prefetch={false} href={ROUTES.services} aria-current={isActive(ROUTES.services) ? 'page' : undefined}>الخدمات</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className={navItemClass(isActive(ROUTES.stores))}>
            <Link prefetch={false} href={ROUTES.stores} aria-current={isActive(ROUTES.stores) ? 'page' : undefined}>المتاجر</Link>
          </Button>
        </nav>

        <div className="hidden flex-1 md:block">
          {!onSearchPage && !isHomePage && showSearch && <SearchBar />}
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
                <Link prefetch={false} href={ROUTES.login}>تسجيل الدخول</Link>
              </Button>
              <Button asChild size="sm">
                <Link prefetch={false} href={ROUTES.register}>إنشاء حساب</Link>
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
      {!onSearchPage && !isHomePage && showSearch && (
        <div className="border-t px-4 py-2 md:hidden">
          <SearchBar />
        </div>
      )}
          <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </header>
  );
}
