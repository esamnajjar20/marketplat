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
import { MobileNav }      from './MobileNav';
import { Button }         from '@/components/shared/ui/Button';
import { ROUTES }         from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

export function PublicHeader() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return (
    <header className="pwa-safe-top sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        <Link href={ROUTES.home} className="shrink-0">
          <Logo />
        </Link>

        <div className="hidden flex-1 md:block">
          <SearchBar />
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {isAuthenticated ? (
            <>
              <Button asChild variant="ghost" size="sm">
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

        {/* Mobile: hamburger */}
        {/* FIX UX-01: ml-auto is a physical (not logical) property — in
            this RTL layout it pushes the hamburger to the visual right,
            which happens to coincide with the trailing edge here only
            because flex order puts it last; me-auto is the logical
            equivalent and stays correct if the app ever adds an LTR
            locale. */}
        <div className="me-auto md:hidden">
          <MobileNav />
        </div>
      </div>

      {/* Mobile search bar */}
      <div className="border-t px-4 py-2 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}
