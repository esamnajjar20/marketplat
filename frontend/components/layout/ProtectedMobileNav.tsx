/**
 * ProtectedMobileNav — slide-out drawer navigation for the authenticated
 * section on small screens.
 *
 * AUDIT-FIX (protected #1 — critical): ProtectedSidebar is
 * `hidden ... md:block`, and ProtectedHeader had no hamburger/drawer
 * trigger and no fallback at all under `md` — unlike (public), which
 * already solves the identical problem with MobileNav.tsx. Below `md`,
 * the five ProtectedSidebar links (dashboard/my ads/favorites/messages/
 * settings) were reachable only through UserMenu, and UserMenu itself
 * doesn't cover every destination either. This drawer follows the same
 * open/close wiring as MobileNav (useUIStore's isMobileNavOpen), but
 * with its own trigger scoped to ProtectedHeader, and a link set that
 * covers ProtectedSidebar's five links plus the destinations documented
 * as under-linked in the same audit pass: "خدماتي" (#2), "متجري" which
 * now also links onward to /my-store/followed (#3), and "البحثات
 * المحفوظة" (#4, already added onto ProtectedSidebar directly, included
 * here too for parity since ProtectedSidebar is exactly what's hidden
 * at this breakpoint).
 *
 * REORG-07: added a "تصفح" section (same 5 links as public MobileNav —
 * home/search/stores/services/service-providers) as the first section.
 * Previously this drawer only had account links; a signed-in user on
 * mobile had no path back to public browse without leaving the
 * protected section, same gap REORG-06 closed on desktop via
 * ProtectedHeader.
 *
 * REORG-08: "نشاطي" (/activity) added to LINKS — present in MobileNav
 * and ProtectedSidebar already, was the one place it was missing.
 *
 * REORG-04: "خدماتي" and "متجري" became disclosure groups here too,
 * same structure/children as ProtectedSidebar's DisclosureGroup, so the
 * two navs stay in sync instead of one having flat links to just the
 * group roots.
 *
 * ROLE-SEP 3.2: same state layer as ProtectedSidebar — collapses to a
 * single CTA row per group until the user has a SellerProfile /
 * ServiceProviderDetails. See ProtectedSidebar's doc comment: gated on
 * isSuccess && data only, no isError branch — loading and "not yet"
 * and a real fetch error all render identically as the CTA row.
 * Duplicated here rather than shared because the two navs already
 * don't share a component, only the group constants' shape.
 *
 * SELLER-GATE UPDATE: "نشر إعلان" already has two always-visible entry
 * points at this breakpoint — the CTA in ProtectedHeader and BottomNav's
 * raised center button — both now swap to "أنشئ حساب بائع" for
 * non-sellers, so no separate adCreate link was added here. إعلاناتي
 * WAS added below (see SELLER-GATE comment near LINKS), since unlike
 * adCreate it had no other entry point in this drawer.
 */
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WithSearch } from '@/components/layout/WithSearch';
import { ChevronDown, ChevronLeft, User, ExternalLink, Store, WalletCards } from 'lucide-react';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { useAuthStore, selectIsAdminTier, selectUser } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { BROWSE_LINKS, ACTIVITY_GROUP, SERVICES_GROUP, STORE_GROUP, settingsGroupFor, requestsGroupFor, navChildIsActive, type NavDisclosureGroup } from '@/lib/navigation';
import { useIsSeller } from '@/hooks/queries/useSellers';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';
import { useMyStore } from '@/hooks/queries/useStores';
import { useNavigationUsage } from '@/hooks/useNavigationUsage';

const selectCloseMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.closeMobileNav;
const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;

// Primary account destinations. Secondary activity items are under
// ACTIVITY_GROUP (same grouping as ProtectedSidebar).
const LINKS = [
  { label: 'لوحة التحكم', href: ROUTES.dashboard },
  { label: 'الرسائل', href: ROUTES.messages },
] as const;

const NAV_ID = 'protected-mobile-nav-drawer';
const TOGGLE_ID = 'protected-mobile-nav-toggle';

function DrawerDisclosureGroup({
  group, pathname, onNavigate, search = '',
}: {
  group: typeof SERVICES_GROUP | typeof STORE_GROUP | NavDisclosureGroup; // + requests/settings via NavDisclosureGroup
  pathname: string;
  onNavigate: () => void;
  search?: string;
}) {
  const isAnyChildActive = group.children.some((c) => navChildIsActive(pathname, c, search));
  const [isOpen, setIsOpen] = useState(isAnyChildActive);

  return (
    <li>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-base font-medium transition-colors',
          isAnyChildActive && !isOpen ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
        )}
      >
        <span className="flex-1 text-start">{group.label}</span>
        {isOpen
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          : <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      </button>
      {isOpen && (
        <ul className="mt-1 flex flex-col gap-1">
          {group.children.map((child) => {
            const isActive = navChildIsActive(pathname, child, search);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  // FIX RSC-PREFETCH-STORM-02: see ProtectedSidebar.
                  prefetch={false}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2 ms-4 text-base font-medium transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function ProtectedMobileNav() {
  const isOpen = useUIStore(selectIsMobileNavOpen);
  const toggle = useUIStore(selectToggleMobileNav);
  const close = useUIStore(selectCloseMobileNav);
  const pathname = usePathname();
  const user = useAuthStore(selectUser);
  const isAdminTier = useAuthStore(selectIsAdminTier);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isSeller, isLoaded: sellerLoaded, showRoleSkeleton } = useIsSeller();
  const { isProvider, showRoleSkeleton: showProviderSkeleton } = useIsProvider();
  const { data: myStore } = useMyStore({ enabled: isSeller });
  const { recordNavigation, isUsed } = useNavigationUsage();
  const [showBrowse, setShowBrowse] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;

      const root = drawerRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('aria-hidden'));
      if (!focusable.length) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  // BUG FIX: opening this drawer previously left <body> free to scroll
  // — with the drawer fixed-positioned on top, scrolling (touch drag or
  // wheel) still moved the dashboard content underneath it, since
  // nothing told the page itself to stop scrolling while the drawer is
  // open. Locking overflow on <body> for the duration is the standard
  // fix (same technique any modal/sheet needs); restored on close or
  // unmount so normal scrolling always resumes.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // SW-FIX-DRAWER-FOCUS-MOUNT: the previous version unconditionally
  // ran the else-branch (focus the toggle) on first mount whenever the
  // drawer started closed — meaning merely landing on /dashboard with
  // no user interaction yanked keyboard focus to the hamburger button.
  // Only run the restore branch when the drawer has actually been open
  // at least once before.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      closeButtonRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      (document.getElementById(TOGGLE_ID) as HTMLButtonElement | null)?.focus();
    }
  }, [isOpen]);

  return (
    <>
      <button
        id={TOGGLE_ID}
        onClick={toggle}
        className="rounded p-2 hover:bg-muted lg:hidden"
        aria-label={isOpen ? 'أغلق القائمة' : 'افتح القائمة'}
        aria-expanded={isOpen}
        aria-controls={NAV_ID}
      >
        <span aria-hidden="true" className="block h-0.5 w-5 bg-foreground" />
        <span aria-hidden="true" className="mt-1 block h-0.5 w-5 bg-foreground" />
        <span aria-hidden="true" className="mt-1 block h-0.5 w-5 bg-foreground" />
      </button>

      {mounted && createPortal(
        <>
      {isOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <nav
        id={NAV_ID}
        className={cn(
          // FIX MOBILE-01: max-w-[85vw] added — a fixed w-72 (288px)
          // with no relative cap can exceed the viewport on narrow
          // phones, forcing this drawer itself (not the page) into
          // horizontal overflow.
          //
          // BUG FIX: overflow-y-auto + overscroll-contain added. The
          // panel is fixed inset-y-0 (full viewport height) with no
          // scroll container of its own, while the body-scroll-lock
          // effect above sets document.body's overflow to hidden while
          // open. Once a DrawerDisclosureGroup ("متجري"/"خدماتي")
          // expands and pushes the list taller than the viewport, there
          // was nothing left that could scroll — not the body (locked)
          // and not the panel (no overflow rule) — so the extra items
          // were just clipped and unreachable. overflow-y-auto lets the
          // panel itself scroll; overscroll-contain stops that scroll
          // from chaining to the locked body once the panel hits its
          // own top/bottom.
          // FIX PWA-STANDALONE: same edge-to-edge clipping as MobileNav.tsx
          // (see its identical fix's comment) — this panel's p-6 top
          // padding isn't enough to clear the OS status bar in standalone/
          // TWA mode, since there's no browser chrome to push fixed
          // inset-y-0 content below it.
          'fixed inset-y-0 right-0 z-[100] w-72 max-w-[85vw] overflow-y-auto overscroll-contain bg-background p-6 pt-[max(1.5rem,env(safe-area-inset-top))] shadow-xl transition-transform duration-200 lg:hidden',
          // start-0 (inset-inline-start) in this RTL app (dir="rtl") maps
          // to right:0 — MDN: "with direction rtl, inset-inline-start
          // moves the element from the left side to the right side".
          // transform is a physical property and never mirrors with
          // dir. For a right-anchored (start-0/right:0) drawer, closing
          // must move it RIGHT (positive translate-x-full) to clear the
          // viewport — negative translate-x-full instead pushes it
          // left, onto the visible portion of the screen. Kept in sync
          // with MobileNav.tsx's identical drawer so the side menu
          // opens from the same edge across the public and protected
          // areas.
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
        ref={drawerRef}
        aria-label="القائمة الشخصية"
        // SW-FIX-DRAWER-INERT: was `aria-hidden={!isOpen}` on an
        // off-canvas <nav> kept in the DOM (translate-x-full) — links
        // and buttons stayed keyboard-focusable while hidden from AT,
        // which Chrome now warns about ("Blocked aria-hidden on an
        // element because its descendant retained focus") and which
        // confuses screen-reader tree navigation. React 19 supports
        // `inert` natively — it removes the whole subtree from the a11y
        // tree, blocks focus, and blocks events in one attribute, which
        // is exactly what an off-canvas drawer needs.
        inert={!isOpen}
      >
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">القائمة</span>
          <button
            ref={closeButtonRef}
            onClick={close}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="أغلق القائمة"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowBrowse((value) => !value)}
          aria-expanded={showBrowse}
          className="mt-6 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          <span className="flex-1 text-start">استكشاف</span>
          {showBrowse ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>
        {showBrowse && (
          <ul className="flex flex-col gap-1">
            {BROWSE_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  prefetch={false}
                  onClick={() => { recordNavigation(link.href); close(); }}
                  aria-current={pathname === link.href ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium hover:bg-muted',
                    pathname === link.href ? 'bg-primary text-primary-foreground' : '',
                  )}
                >
                  <link.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ul className="mt-3 flex flex-col gap-1 border-t pt-3">
          {LINKS.map((link) => {
            // SW-FIX-PMN-DEAD-CAST: same as ProtectedSidebar's fix — no
            // activeMatch field exists on LINKS entries.
            const isActive = pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  // FIX RSC-PREFETCH-STORM-02: see ProtectedSidebar.
                  prefetch={false}
                  onClick={() => { recordNavigation(link.href); close(); }}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2 text-base font-medium transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}

          {/* NAV-ORDER: same priority as ProtectedSidebar / BROWSE_LINKS */}
          {showRoleSkeleton && (
            <li aria-hidden className="px-3 py-2">
              <div className="h-9 animate-pulse rounded-md bg-muted/70" />
            </li>
          )}
          {!showRoleSkeleton && isSeller && (
            <li>
              <Link
                href={ROUTES.myAds}
                prefetch={false}
                onClick={close}
                aria-current={pathname === ROUTES.myAds || pathname.startsWith(`${ROUTES.myAds}/`) ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-base font-medium transition-colors',
                  pathname === ROUTES.myAds || pathname.startsWith(`${ROUTES.myAds}/`) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                إعلاناتي
              </Link>
            </li>
          )}
          {sellerLoaded && !isSeller && (
            <li>
              <Link
                href={ROUTES.settings.seller}
                prefetch={false}
                onClick={close}
                aria-current={pathname === ROUTES.settings.root ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium transition-colors',
                  pathname === ROUTES.settings.root
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                أنشئ حساب بائع
              </Link>
            </li>
          )}
          {isSeller && (
            <Suspense fallback={<DrawerDisclosureGroup group={STORE_GROUP} pathname={pathname} onNavigate={close} />}>
              <WithSearch>
                {(search) => (
                  <DrawerDisclosureGroup group={STORE_GROUP} pathname={pathname} onNavigate={close} search={search} />
                )}
              </WithSearch>
            </Suspense>
          )}
          {isSeller && myStore?.status === 'ACTIVE' && (
            <li>
              <Link
                href={ROUTES.storeDetail(myStore.id)}
                prefetch={false}
                onClick={close}
                aria-current={pathname.startsWith(ROUTES.storeDetail(myStore.id)) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium transition-colors',
                  pathname.startsWith(ROUTES.storeDetail(myStore.id))
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                عرض متجري
              </Link>
            </li>
          )}
          {showProviderSkeleton && (
            <li aria-hidden className="px-3 py-2">
              <div className="h-9 animate-pulse rounded-md bg-muted/60" />
            </li>
          )}
          {(isSeller || isProvider) && (
            <li>
              <Link
                href={ROUTES.sales}
                prefetch={false}
                onClick={() => { recordNavigation(ROUTES.sales); close(); }}
                aria-current={pathname.startsWith(ROUTES.sales) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium transition-colors',
                  pathname.startsWith(ROUTES.sales) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                <WalletCards className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                مبيعاتي
              </Link>
            </li>
          )}
          {!showProviderSkeleton && isProvider && (
            <Suspense fallback={<DrawerDisclosureGroup group={SERVICES_GROUP} pathname={pathname} onNavigate={close} />}>
              <WithSearch>
                {(search) => (
                  <DrawerDisclosureGroup group={SERVICES_GROUP} pathname={pathname} onNavigate={close} search={search} />
                )}
              </WithSearch>
            </Suspense>
          )}
          <DrawerDisclosureGroup group={requestsGroupFor(false)} pathname={pathname} onNavigate={() => { recordNavigation(ROUTES.myOpenRequests); close(); }} />
          {user && (
            <li>
              <Link
                href={ROUTES.userProfile(user.id)}
                prefetch={false}
                onClick={close}
                aria-current={pathname.startsWith(ROUTES.userProfile(user.id)) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium transition-colors',
                  pathname.startsWith(ROUTES.userProfile(user.id))
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                عرض ملفي
              </Link>
            </li>
          )}
          {(pathname.startsWith(ROUTES.activity) || isUsed(ROUTES.activity) || isUsed(ROUTES.favorites) || isUsed(ROUTES.savedSearches)) && (
            <Suspense fallback={<DrawerDisclosureGroup group={ACTIVITY_GROUP} pathname={pathname} onNavigate={close} />}>
              <WithSearch>
                {(search) => (
                  <DrawerDisclosureGroup group={ACTIVITY_GROUP} pathname={pathname} onNavigate={() => { recordNavigation(ROUTES.activity); close(); }} search={search} />
                )}
              </WithSearch>
            </Suspense>
          )}

          <Suspense fallback={<DrawerDisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} onNavigate={close} />}>
            <WithSearch>
              {(search) => (
                <DrawerDisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} onNavigate={() => { recordNavigation(ROUTES.settings.root); close(); }} search={search} />
              )}
            </WithSearch>
          </Suspense>

          {isAdminTier && (
            <li>
              <Link
                href={ROUTES.admin.dashboard}
                prefetch={false}
                onClick={close}
                aria-current={pathname === ROUTES.admin.root || pathname.startsWith(`${ROUTES.admin.root}/`) ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-base font-medium transition-colors',
                  pathname === ROUTES.admin.root || pathname.startsWith(`${ROUTES.admin.root}/`)
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                لوحة الإدارة
              </Link>
            </li>
          )}
          <li>
            <button
              onClick={() => { logout(); close(); }}
              disabled={isLoggingOut}
              className="block w-full text-start rounded-md px-3 py-2 text-base font-medium text-destructive hover:bg-muted disabled:opacity-50"
            >
              {isLoggingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
            </button>
          </li>
        </ul>
      </nav>
        </>,
        document.body,
      )}
    </>
  );
}
