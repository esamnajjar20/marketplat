'use client';

import { useEffect, useState } from 'react';
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
const selectIsMobileNavOpen = (s: ReturnType<typeof useUIStore.getState>) => s.isMobileNavOpen;

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
  // HYDRATION-SAFE: `mounted` becomes true only after the first commit,
    // so the first client render matches the server (anonymous). Zustand
    // persist rehydrates synchronously, so `isHydrated` alone is not enough.
  // HYDRATION-SAFE: hooks must run UNCONDITIONALLY (Rules of Hooks).
  // The `mounted` gate is applied to the DERIVED values below, not to the
  // hook calls themselves — otherwise React loses hook order tracking
  // and throws a runtime TypeError.
  const isAuthenticatedRaw = useAuthStore(selectHydratedIsAuthenticated);
  const userRaw = useAuthStore(selectHydratedUser);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isAuthenticated = mounted && isAuthenticatedRaw;
  const user = mounted ? userRaw : null;
  const toggleMobileNav = useUIStore(selectToggleMobileNav);
  const mobileNavOpen = useUIStore(selectIsMobileNavOpen);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { hidden: scrollNavHidden } = useScrollDirection({
    threshold: 12,
    topOffset: 72,
    hideAfter: 112,
  });
  // Keep navigation available while a sheet/drawer is active; otherwise hide
  // only after a deliberate downward scroll and reveal on upward scroll/top.
  const navHidden = scrollNavHidden && !exploreOpen && !createOpen && !mobileNavOpen;
  // FIX NETWORK-BANNER-UNIFY-01: شارة «غير متصل» نُقلت لـ NetworkStatusBanner
  // (شريط سفلي موحّد وواضح). يبقى هنا فقط عدّاد طابور الطلبات.
  // FIX QUEUE-BADGE-01: عدّاد "طلبات بالانتظار" كشارة رقم بزاوية الأيقونة.
  const queuedCount = useQueuedRequestCount();
  // DRAFTS-BADGE-01
  const draftsCount = usePendingDraftsCount(user?.id);

  const homeItem = { label: 'الرئيسية', href: ROUTES.home, icon: Home } as const;
  const messagesItem = { label: 'الرسائل', href: ROUTES.messages, icon: MessageCircle } as const;

  // "استكشاف" reads as active on any of the destinations its own sheet
  // links to (see ExploreSheet), not just /search itself — otherwise
  // landing on /stores or /service-providers via a direct link would
  // leave the whole bottom bar showing no active tab at all.
  const EXPLORE_ACTIVE_PREFIXES = [
    ROUTES.search, ROUTES.products, ROUTES.services, ROUTES.stores, ROUTES.serviceProviders,
  ] as const;
  const isExploreActive = EXPLORE_ACTIVE_PREFIXES.some((href) => pathname.startsWith(href));

  function renderItem({ label, href, icon: Icon }: {
    label: string; href: string; icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean; strokeWidth?: number }>;
  }) {
    const isActive = href === ROUTES.home ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        prefetch={false}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex min-h-[52px] min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-[11px] transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          isActive ? 'font-extrabold text-primary' : 'font-semibold text-muted-foreground hover:text-primary',
        )}
      >
        <span className="relative inline-flex items-center justify-center">
          <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden={true} />
        </span>
        <span>{label}</span>
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
        'pwa-safe-bottom fixed inset-x-0 bottom-0 z-50 flex h-[68px] items-end border-t border-border bg-background px-2 pb-2',
        'md:hidden native-bottom-nav',
        'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        navHidden ? 'translate-y-[calc(100%+1rem)] pointer-events-none' : 'translate-y-0',
      )}
    >
      {renderItem(homeItem)}
      {renderItem(messagesItem)}

      <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
        <div className="relative -mt-[22px]">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-expanded={createOpen}
            aria-haspopup="dialog"
            aria-label={draftsCount > 0 ? `أضف — ${draftsCount} مسودة معلّقة` : 'أضف'}
            className={cn(
              'flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-full',
              'bg-primary text-primary-foreground',
              'shadow-[0_6px_16px_rgba(57,127,86,0.35)] transition-transform',
              'transition-[transform,box-shadow] duration-150 hover:scale-[1.03] hover:shadow-[0_8px_20px_rgba(57,127,86,0.4)] active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden={true} />
          </button>
          {isAuthenticated && draftsCount > 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-1 -end-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#AD531F] px-1 text-[10px] font-extrabold leading-none text-white"
            >
              {draftsCount > 9 ? '9+' : draftsCount}
            </span>
          )}
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground">أضف</span>
      </div>

      <button
        type="button"
        onClick={() => setExploreOpen(true)}
        aria-expanded={exploreOpen}
        aria-current={isExploreActive ? 'page' : undefined}
        aria-haspopup="dialog"
        className={cn(
          'relative flex min-h-[52px] min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-[11px] transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          isExploreActive ? 'font-extrabold text-primary' : 'font-semibold text-muted-foreground hover:text-primary',
        )}
      >
        <span className="relative inline-flex items-center justify-center">
          <Compass className="h-5 w-5" strokeWidth={isExploreActive ? 2.2 : 1.8} aria-hidden={true} />
        </span>
        <span>استكشاف</span>
      </button>

      {/* FIX SYNC-NAV-01: شارة الطابور كانت رقم فقط بدون وجهة.
          صارت رابطاً لـ /settings/sync (مركز المزامنة) بدل أن تبقى
          داخل رابط الملف الشخصي (a داخل a غير صالح، وما يوصل للمزامنة).
          الملف الشخصي/القائمة يبقيان على سلوكهما السابق. */}
      {isAuthenticated && user?.id ? (
        <div className="relative flex min-h-[52px] flex-1 flex-col items-center justify-center">
          <button
            type="button"
            onClick={toggleMobileNav}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-0.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              mobileNavOpen ? 'font-extrabold text-primary' : 'font-semibold text-muted-foreground hover:text-primary',
            )}
          >
            <span className="relative inline-flex">
              <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={22} className="text-2xs" />
            </span>
            القائمة
          </button>
          {queuedCount > 0 && (
            <Link
              href={ROUTES.offline.sync}
              prefetch={false}
              aria-label={`${queuedCount} طلب بالانتظار — مركز المزامنة`}
              className="absolute top-1 end-[calc(50%-18px)] z-10 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-warning px-[3px] text-3xs font-semibold leading-none text-warning-foreground shadow-sm hover:brightness-95"
            >
              {queuedCount > 9 ? '9+' : queuedCount}
            </Link>
          )}
        </div>
      ) : (
        <div className="relative flex min-h-[52px] flex-1 flex-col items-center justify-center">
          <button
            type="button"
            onClick={toggleMobileNav}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-0.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              mobileNavOpen ? 'font-extrabold text-primary' : 'font-semibold text-muted-foreground hover:text-primary',
            )}
          >
            <span className="relative inline-flex">
              <Menu className="h-5 w-5" strokeWidth={1.8} aria-hidden={true} />
            </span>
            القائمة
          </button>
          {queuedCount > 0 && (
            <Link
              href={ROUTES.offline.sync}
              prefetch={false}
              aria-label={`${queuedCount} طلب بالانتظار — مركز المزامنة`}
              className="absolute top-1 end-[calc(50%-18px)] z-10 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-warning px-[3px] text-3xs font-semibold leading-none text-warning-foreground shadow-sm hover:brightness-95"
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
