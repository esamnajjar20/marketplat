/**
 * ProtectedMobileNav — slide-out drawer navigation for the authenticated
 * section on small screens.
 *
 * AUDIT-FIX (protected #1 — critical): ProtectedSidebar is
 * `hidden ... lg:block`, and ProtectedHeader had no hamburger/drawer
 * trigger and no fallback at all under `lg` — unlike (public), which
 * already solves the identical problem with MobileNav.tsx. Below `lg`,
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
 * P3 FIX (layout audit §9, "أضف إعلانك" غائب عن هذا الـdrawer):
 * deliberately not adding a duplicate entry here. "نشر إعلان" already
 * has two always-visible entry points at this breakpoint — the CTA in
 * ProtectedHeader (unconditionally rendered, not `hidden` at any
 * width) and BottomNav's raised center button — so a third copy inside
 * this drawer would be redundant, not a gap. If either of those is
 * ever removed, add ROUTES.adCreate back into LINKS/TRAILING_LINKS.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Store as StoreIcon, Wrench as WrenchIcon, Users, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { useAuthStore, selectIsAdmin } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';

const selectCloseMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.closeMobileNav;
const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;

// REORG-07: identical to MobileNav.tsx's BROWSE_LINKS.
const BROWSE_LINKS = [
  { label: 'الرئيسية', href: ROUTES.home, icon: Home },
  { label: 'البحث', href: ROUTES.search, icon: Search },
  { label: 'المتاجر', href: ROUTES.stores, icon: StoreIcon },
  { label: 'الخدمات', href: ROUTES.services, icon: WrenchIcon },
  { label: 'مقدمو الخدمة', href: ROUTES.serviceProviders, icon: Users },
] as const;

const LINKS = [
  { label: 'لوحة التحكم', href: ROUTES.dashboard },
  { label: 'إعلاناتي', href: ROUTES.myAds },
  { label: 'المفضلة', href: ROUTES.favorites },
  { label: 'الرسائل', href: ROUTES.messages },
  { label: 'البحثات المحفوظة', href: ROUTES.savedSearches },
  // REORG-08
  { label: 'نشاطي', href: ROUTES.activity },
] as const;

// REORG-04: same grouping as ProtectedSidebar's SERVICES_GROUP.
const SERVICES_GROUP = {
  label: 'خدماتي',
  href: ROUTES.myServices,
  children: [
    { label: 'خدماتي', href: ROUTES.myServices },
    { label: 'الطلبات الواردة', href: ROUTES.incomingServiceRequests },
    { label: 'مواعيدي', href: ROUTES.myServiceAppointments },
    { label: 'طلباتي', href: ROUTES.myServiceRequests },
  ],
} as const;

// REORG-04: same grouping as ProtectedSidebar's STORE_GROUP.
const STORE_GROUP = {
  label: 'متجري',
  href: ROUTES.myStore,
  children: [
    { label: 'متجري', href: ROUTES.myStore },
    { label: 'منتجاتي', href: ROUTES.myStoreProducts },
    { label: 'المتاجر المتابَعة', href: ROUTES.myFollowedStores },
  ],
} as const;

// FIX UX-16: "الإعدادات" was a single flat link straight to
// /settings/profile in TRAILING_LINKS below — unlike ProtectedSidebar,
// which folds all 8 settings destinations into a disclosure group
// (see ProtectedSidebar's SETTINGS_GROUP + its "sidebar داخل sidebar"
// doc comment for why). None of security/sessions/notifications/
// blocked-users/seller/service-provider had any navigation of their
// own on this breakpoint, so there was no visible path from this
// drawer (or from any settings sub-page itself) to any of them other
// than the profile page — same group, same pattern as
// SERVICES_GROUP/STORE_GROUP above, so mobile matches desktop.
const SETTINGS_GROUP = {
  label: 'الإعدادات',
  href: ROUTES.settings.profile,
  children: [
    { label: 'الملف الشخصي', href: ROUTES.settings.profile },
    { label: 'ملف البائع', href: ROUTES.settings.seller },
    { label: 'ملف مقدم الخدمة', href: ROUTES.settings.serviceProvider },
    { label: 'متجري', href: ROUTES.myStore },
    { label: 'الأمان', href: ROUTES.settings.security },
    { label: 'الجلسات', href: ROUTES.settings.sessions },
    { label: 'الإشعارات', href: ROUTES.settings.notifications },
    { label: 'المستخدمون المحظورون', href: ROUTES.settings.blockedUsers },
  ],
} as const;

const TRAILING_LINKS = [
  // FEAT-REPORT-USER-STORE: added for parity with ProtectedSidebar,
  // same reasoning as this file's own doc comment on "البحثات المحفوظة".
  { label: 'بلاغاتي', href: ROUTES.myReports },
] as const;

const NAV_ID = 'protected-mobile-nav-drawer';
const TOGGLE_ID = 'protected-mobile-nav-toggle';

function DrawerDisclosureGroup({
  group, pathname, onNavigate,
}: {
  group: typeof SERVICES_GROUP | typeof STORE_GROUP | typeof SETTINGS_GROUP;
  pathname: string;
  onNavigate: () => void;
}) {
  const isAnyChildActive = group.children.some((c) => pathname.startsWith(c.href));
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
          : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      </button>
      {isOpen && (
        <ul className="mt-1 flex flex-col gap-1">
          {group.children.map((child) => {
            const isActive = pathname.startsWith(child.href);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
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
  const isAdmin = useAuthStore(selectIsAdmin);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { data: sellerProfile, isSuccess: sellerLoaded } = useMySellerProfile();
  const { data: serviceProvider, isSuccess: providerLoaded } = useMyServiceProvider();
  const isSeller = sellerLoaded && Boolean(sellerProfile);
  const isProvider = providerLoaded && Boolean(serviceProvider);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
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

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    } else {
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

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
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
          'fixed inset-y-0 end-0 z-[60] w-72 max-w-[85vw] overflow-y-auto overscroll-contain bg-background p-6 shadow-xl transition-transform duration-200 lg:hidden',
          // end-0 (inset-inline-end) in this RTL app (dir="rtl") maps
          // to left:0 — verified against the CSS spec (MDN:
          // "with direction rtl, inset-inline-end moves the element
          // from the right side to the left side"), not right:0 as an
          // earlier edit here incorrectly assumed. transform is a
          // physical property and never mirrors with dir. For a
          // left-anchored (end-0/left:0) drawer, closing must move it
          // LEFT (negative translate-x-full) to clear the viewport —
          // translate-x-full (positive) instead pushes it right, onto
          // the visible portion of the screen, which is the bug this
          // reverts.
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="القائمة الشخصية"
        aria-hidden={!isOpen}
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

        {/* REORG-07: "تصفح" section — same content/order as public
            MobileNav's own BROWSE_LINKS, first in the drawer. */}
        <p className="mt-6 px-3 pb-1 text-xs font-medium text-muted-foreground">تصفح</p>
        <ul className="flex flex-col gap-1">
          {BROWSE_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={close}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
              >
                <link.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <ul className="mt-3 flex flex-col gap-1 border-t pt-3">
          {LINKS.map((link) => {
            const isActive = pathname.startsWith((link as { activeMatch?: string }).activeMatch ?? link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={close}
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

          {isProvider ? (
            <DrawerDisclosureGroup group={SERVICES_GROUP} pathname={pathname} onNavigate={close} />
          ) : (
            <li>
              <Link
                href={ROUTES.settings.serviceProvider}
                onClick={close}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                أصبح مقدّم خدمة
              </Link>
            </li>
          )}
          {/* FIX UX-ROLES-01: mirrors ProtectedSidebar's identical fix —
              "أصبح بائعاً" previously only lived nested inside
              SETTINGS_GROUP, unlike its "أصبح مقدّم خدمة"/"افتح متجرك"
              neighbors, both single-tap top-level rows. */}
          {!isSeller && (
            <li>
              <Link
                href={ROUTES.settings.seller}
                onClick={close}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                أصبح بائعاً
              </Link>
            </li>
          )}
          {isSeller ? (
            <DrawerDisclosureGroup group={STORE_GROUP} pathname={pathname} onNavigate={close} />
          ) : (
            <li>
              <Link
                href={ROUTES.myStore}
                onClick={close}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                افتح متجرك
              </Link>
            </li>
          )}

          {TRAILING_LINKS.map((link) => {
            const isActive = pathname.startsWith((link as { activeMatch?: string }).activeMatch ?? link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={close}
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

          <DrawerDisclosureGroup group={SETTINGS_GROUP} pathname={pathname} onNavigate={close} />

          {isAdmin && (
            <li>
              <Link
                href={ROUTES.admin.dashboard}
                onClick={close}
                className="block rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
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
    </>
  );
}
