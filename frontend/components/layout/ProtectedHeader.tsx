/**
 * ProtectedHeader — top bar for authenticated pages (dashboard, my ads, etc.).
 * Simpler than PublicHeader — no search bar, quick-post CTA, user menu.
 */
'use client';

import Link       from 'next/link';
import { Logo }   from './Logo';
import { UserMenu } from './UserMenu';
import { NotificationBell } from './NotificationBell';
import { ProtectedMobileNav } from './ProtectedMobileNav';
import { Button }  from '@/components/shared/ui/Button';
import { ROUTES }  from '@/lib/constants';

export function ProtectedHeader() {
  return (
    <header className="pwa-safe-top sticky top-0 z-50 flex min-h-16 w-full items-center border-b bg-background px-6 gap-4">
      {/* AUDIT-FIX (protected #1): hamburger trigger for ProtectedMobileNav,
          the only way to reach ProtectedSidebar's destinations below `lg`. */}
      <ProtectedMobileNav />
      <Link href={ROUTES.home}>
        <Logo />
      </Link>
      <div className="me-auto flex items-center gap-3">
        <Button asChild size="sm">
          <Link href={ROUTES.adCreate}>+ نشر إعلان</Link>
        </Button>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
