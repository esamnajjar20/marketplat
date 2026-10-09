'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, MessageCircle, Menu, Plus } from 'lucide-react';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore, selectHydratedIsAuthenticated, selectHydratedUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { ExploreSheet } from '@/components/layout/ExploreSheet';
import { CreateSheet } from '@/components/layout/CreateSheet';
import { useQueuedRequestCount } from '@/hooks/useQueuedRequestCount';
import { usePendingDraftsCount } from '@/hooks/usePendingDraftsCount';
import { useScrollDirection } from '@/hooks/useScrollDirection';

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
  const isAuthenticated = useAuthStore(selectHydratedIsAuthenticated);
  const user = useAuthStore(selectHydratedUser);
  const toggleMobileNav = useUIStore(selectToggleMobileNav);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { hidden: scrollNavHidden } = useScrollDirection();
  // Sheets open → force bar visible (user is mid-action).
  const navHidden = scrollNavHidden && !exploreOpen && !createOpen;
  // FIX NETWORK-BANNER-UNIFY-01: شارة «غير متصل» نُقلت لـ NetworkStatusBanner
  // (شريط سفلي موحّد وواضح). يبقى هنا فقط عدّاد طابور الطلبات.
  // FIX QUEUE-BADGE-01: عدّاد "طلبات بالانتظار" كشارة رقم بزاوية الأيقونة.
  const queuedCount = useQueuedRequestCount();
  // DRAFTS-BADGE-01
  const draftsCount = usePendingDraftsCount(user?.id);

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
        prefetch={false}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-2xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span
          className={cn(
            'relative inline-flex min-h-8 min-w-10 items-center justify-center rounded-lg px-2.5 py-1 transition-colors duration-150',
            isActive && 'bg-primary-soft text-primary shadow-xs',
          )}
        >
          <Icon className={cn('h-5 w-5', isActive && 'text-primary')} aria-hidden={true} />
        </span>
        <span className={cn(isActive && 'font-semibold text-primary')}>{label}</span>
      </Link>
    );
  }

  return (
    <nav
      aria-label="التنقل الرئيسي"
      data-hidden={navHidden ? 'true' : 'false'}
      aria-hidden={navHidden ? true : undefined}
      inert={navHidden ? true : undefined}
      className={cn(
        'pwa-safe-bottom fixed inset-x-0 bottom-0 z-50 flex items-center border-t border-border/80',
        'bg-background/95 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)]',
        'backdrop-blur-md supports-[backdrop-filter]:bg-background/85 md:hidden',
        // CLEANUP-EASE-AMBIGUOUS-01: ease-[cubic-bezier(...)] was ambiguous in
        // Tailwind (matches both transitionProperty and transitionTiming).
        // Use explicit arbitrary property so the intent is unambiguous.
        'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] will-change-transform',
        navHidden ? 'translate-y-[calc(100%+2.5rem)] pointer-events-none' : 'translate-y-0',
      )}
    >
      {leadingItems.map(renderItem)}

      <button
        type="button"
        onClick={() => setExploreOpen(true)}
        aria-expanded={exploreOpen}
        aria-haspopup="dialog"
        className={cn(
          'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-2xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          isExploreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <span
          className={cn(
            'relative inline-flex min-h-8 min-w-10 items-center justify-center rounded-lg px-2.5 py-1 transition-colors duration-150',
            isExploreActive && 'bg-primary/10',
          )}
        >
          <Compass className={cn('h-5 w-5', isExploreActive && 'text-primary')} aria-hidden={true} />
        </span>
        <span className={cn(isExploreActive && 'font-semibold text-primary')}>استكشاف</span>
      </button>

      <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
        <div className="relative -mt-5">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-expanded={createOpen}
            aria-haspopup="dialog"
            aria-label={draftsCount > 0 ? `أضف — ${draftsCount} مسودة معلّقة` : 'أضف'}
            className={cn(
              'flex h-14 w-14 min-h-[52px] min-w-[52px] items-center justify-center rounded-full',
              'border-4 border-background bg-primary text-primary-foreground',
              'shadow-md shadow-primary/25 transition-transform',
              'transition-[transform,box-shadow] duration-150 hover:scale-[1.03] hover:shadow-lg active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden={true} />
          </button>
          {isAuthenticated && draftsCount > 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-0.5 -end-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-warning px-1 text-2xs font-semibold leading-none text-warning-foreground shadow-sm"
            >
              {draftsCount > 9 ? '9+' : draftsCount}
            </span>
          )}
        </div>
        {/* Label added to match the other four items' icon+label
            pattern — this button was the only one in the bar with no
            visible text, breaking visual consistency with its
            siblings. */}
        <span className="text-2xs font-medium text-muted-foreground">أضف</span>
      </div>

      {trailingItems.map(renderItem)}

      {/* FIX SYNC-NAV-01: شارة الطابور كانت رقم فقط بدون وجهة.
          صارت رابطاً لـ /settings/sync (مركز المزامنة) بدل أن تبقى
          داخل رابط الملف الشخصي (a داخل a غير صالح، وما يوصل للمزامنة).
          الملف الشخصي/القائمة يبقيان على سلوكهما السابق. */}
      {isAuthenticated && user?.id ? (
        <div className="relative flex flex-1 flex-col items-center justify-center min-h-[48px]">
          <Link
            href={ROUTES.userProfile(user.id)}
            prefetch={false}
            aria-current={pathname.startsWith(ROUTES.userProfile(user.id)) || pathname.startsWith('/profile/') ? 'page' : undefined}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-0.5 py-2 text-2xs font-medium transition-colors',
              pathname.startsWith('/profile/') ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="relative inline-flex">
              <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={22} className="text-2xs" />
            </span>
            حسابي
          </Link>
          {queuedCount > 0 && (
            <Link
              href={ROUTES.offline.sync}
              prefetch={false}
              aria-label={`${queuedCount} طلب بالانتظار — مركز المزامنة`}
              className="absolute top-1.5 end-[calc(50%-18px)] z-10 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-warning px-[3px] text-3xs font-semibold leading-none text-warning-foreground shadow-sm hover:brightness-95"
            >
              {queuedCount > 9 ? '9+' : queuedCount}
            </Link>
          )}
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col items-center justify-center min-h-[48px]">
          <button
            type="button"
            onClick={toggleMobileNav}
            className="flex min-h-[48px] w-full flex-col items-center justify-center gap-0.5 py-2 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <span className="relative inline-flex">
              <Menu className="h-5 w-5" aria-hidden={true} />
            </span>
            القائمة
          </button>
          {queuedCount > 0 && (
            <Link
              href={ROUTES.offline.sync}
              prefetch={false}
              aria-label={`${queuedCount} طلب بالانتظار — مركز المزامنة`}
              className="absolute top-1.5 end-[calc(50%-18px)] z-10 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-warning px-[3px] text-3xs font-semibold leading-none text-warning-foreground shadow-sm hover:brightness-95"
            >
              {queuedCount > 9 ? '9+' : queuedCount}
            </Link>
          )}
        </div>
      )}

      <ExploreSheet open={exploreOpen} onOpenChange={setExploreOpen} />
      <CreateSheet open={createOpen} onOpenChange={setCreateOpen} />
    </nav>
  );
}
