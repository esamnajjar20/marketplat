/**
 * ProtectedHeader — top bar for authenticated pages (dashboard, my ads, etc.).
 * Simpler than PublicHeader — no search bar, quick-post CTA, user menu.
 */
'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import Link       from 'next/link';
import { Logo }   from './Logo';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { MessagesLink } from './MessagesLink';
import { ThemeToggle } from './ThemeToggle';
import { ProtectedMobileNav } from './ProtectedMobileNav';
import { Button }  from '@/components/shared/ui/Button';
import { CreateSheet } from './CreateSheet';
import { Plus } from 'lucide-react';
import { ROUTES }  from '@/lib/constants';
import { useIsSeller } from '@/hooks/queries/useSellers';

export function ProtectedHeader() {
  // SELLER-GATE: ad creation requires a SellerProfile server-side
  // (ads.service.ts's createAd) — same isSeller signal
  // ProtectedSidebar/UserMenu already compute. Swaps the CTA to
  // "أنشئ حساب بائع" (→ /settings/seller) instead of hiding it
  // outright, since this is the site's primary conversion button.
  const pathname = usePathname();
  const { isLoaded: sellerLoaded } = useIsSeller();
  const [createOpen, setCreateOpen] = useState(false);

  const searchParams = useSearchParams();
  const isAdsBrowseActive = pathname === ROUTES.search && (searchParams.get('type') ?? 'all') === 'ads';
  const navItemClass = (active: boolean) =>
    active
      ? 'bg-primary-soft text-primary shadow-xs hover:bg-primary-soft/80 hover:text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground';

  return (
    <header className="pwa-safe-top sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 shadow-xs backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-3 px-4 lg:gap-4 lg:px-6">
      {/* AUDIT-FIX (protected #1): hamburger trigger for ProtectedMobileNav,
          the only way to reach ProtectedSidebar's destinations below `lg`. */}
      <ProtectedMobileNav />
      <Link prefetch={false} href={ROUTES.home}>
        <Logo />
      </Link>

      {/* REORG-06: a signed-in user inside /dashboard or any other
          protected page had no direct path to public browse (stores/
          services/service-providers) without leaving the protected
          section first (back button or logo → home). Mirrors
          PublicHeader's same three links, same position (between logo
          and account controls), same lg breakpoint — below lg they stay
          reachable via ProtectedMobileNav's "تصفح" section (REORG-07). */}
      <nav aria-label="التنقل العام" className="hidden items-center gap-1 rounded-xl border border-border/50 bg-surface-1/50 p-1 lg:flex">
        {/* NAV-GAP FIX: mirrors PublicHeader's own addition — see
            lib/navigation.ts's BROWSE_LINKS comment for why ads gets a
            standing link here (and products deliberately doesn't). */}
        <Button asChild variant="ghost" size="sm" className={navItemClass(isAdsBrowseActive)}>
          <Link prefetch={false} href={`${ROUTES.search}?type=ads`} aria-current={isAdsBrowseActive ? 'page' : undefined}>الإعلانات</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className={navItemClass(pathname === ROUTES.stores || pathname.startsWith(`${ROUTES.stores}/`))}>
          <Link prefetch={false} href={ROUTES.stores} aria-current={pathname === ROUTES.stores || pathname.startsWith(`${ROUTES.stores}/`) ? 'page' : undefined}>المتاجر</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className={navItemClass(pathname === ROUTES.services || pathname.startsWith(`${ROUTES.services}/`))}>
          <Link prefetch={false} href={ROUTES.services} aria-current={pathname === ROUTES.services || pathname.startsWith(`${ROUTES.services}/`) ? 'page' : undefined}>الخدمات</Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className={navItemClass(pathname === ROUTES.serviceProviders || pathname.startsWith(`${ROUTES.serviceProviders}/`))}>
          <Link prefetch={false} href={ROUTES.serviceProviders} aria-current={pathname === ROUTES.serviceProviders || pathname.startsWith(`${ROUTES.serviceProviders}/`) ? 'page' : undefined}>مقدمو الخدمة</Link>
        </Button>
      </nav>

      <div className="me-auto flex items-center gap-3">
        {/* Hidden on mobile — BottomNav already has a dedicated raised
            "نشر إعلان"/"أنشئ حساب بائع" button, so this top-bar CTA is
            redundant on small screens; kept visible from `md` up where
            BottomNav is itself hidden (md:hidden). sellerLoaded gates
            out a flash of the wrong label before the query resolves. */}
        {sellerLoaded && (
          <Button
            type="button"
            size="sm"
            className="hidden md:inline-flex gap-1"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            أضف
          </Button>
        )}
        <MessagesLink />
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>
      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    </header>
  );
}
