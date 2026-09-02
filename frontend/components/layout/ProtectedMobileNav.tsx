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

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronRight, User, ExternalLink, Store } from 'lucide-react';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { useAuthStore, selectIsAdmin, selectUser } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import { BROWSE_LINKS, ACTIVITY_GROUP, SERVICES_GROUP, STORE_GROUP, settingsGroupFor, type NavDisclosureGroup } from '@/lib/navigation';
import { useIsSeller } from '@/hooks/queries/useSellers';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';
import { useMyStore } from '@/hooks/queries/useStores';

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
  group, pathname, onNavigate,
}: {
  group: typeof SERVICES_GROUP | typeof STORE_GROUP | NavDisclosureGroup;
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
  const user = useAuthStore(selectUser);
  const isAdmin = useAuthStore(selectIsAdmin);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isSeller, isLoaded: sellerLoaded } = useIsSeller();
  const { isProvider } = useIsProvider();
  const { data: myStore } = useMyStore();

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
        className="rounded p-2 hover:bg-muted md:hidden"
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
          className="fixed inset-0 z-[90] bg-black/50 md:hidden"
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
          'fixed inset-y-0 start-0 z-[100] w-72 max-w-[85vw] overflow-y-auto overscroll-contain bg-background p-6 shadow-xl transition-transform duration-200 md:hidden',
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
          isOpen ? 'translate-x-0' : 'translate-x-full',
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

        {user && (
          <Link
            href={ROUTES.userProfile(user.id)}
            onClick={close}
            className="mt-4 flex items-center gap-3 rounded-xl border border-border/80 bg-card/60 px-3 py-2.5 transition-colors hover:bg-muted/60"
          >
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={44} className="ring-2 ring-background" />
            <span className="min-w-0 flex-1 text-start">
              <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
              <span className="block text-xs text-muted-foreground">عرض الملف الشخصي</span>
            </span>
          </Link>
        )}

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

          <DrawerDisclosureGroup group={ACTIVITY_GROUP} pathname={pathname} onNavigate={close} />


          {/* عرض الملف الشخصي — standalone entry, kept out of LINKS
              (which has no user.id to build the href with) and out of
              SETTINGS_GROUP below (whose children are all edit/manage
              destinations). Mirrors ProtectedSidebar's identical entry
              so mobile and desktop navs stay in sync. */}
          {user && (
            <li>
              <Link
                href={ROUTES.userProfile(user.id)}
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

          {/* AUDIT-FIX (dynamic sidebar): mirrors ProtectedSidebar's
              identical fix - sections for roles the user doesn't hold
              are fully absent, no CTA row. /settings/seller and
              /settings/service-provider unchanged and still reachable
              through SETTINGS_GROUP below. */}
          {isProvider && (
            <DrawerDisclosureGroup group={SERVICES_GROUP} pathname={pathname} onNavigate={close} />
          )}

          {/* SELLER-GATE (myAds): mirrors ProtectedSidebar — ad creation
              requires a SellerProfile server-side, so إعلاناتي moved out
              of the always-visible LINKS above into the same isSeller
              gate as STORE_GROUP. */}
          {isSeller && (
            <li>
              <Link
                href={ROUTES.myAds}
                onClick={close}
                aria-current={pathname.startsWith(ROUTES.myAds) ? 'page' : undefined}
                className={cn(
                  'block rounded-md px-3 py-2 text-base font-medium transition-colors',
                  pathname.startsWith(ROUTES.myAds) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                إعلاناتي
              </Link>
            </li>
          )}

          {/* SELLER-CTA: mirrors ProtectedSidebar's identical CTA —
              shown only while sellerLoaded && !sellerProfile, links to
              /settings/seller. Disappears once isSeller flips true. */}
          {sellerLoaded && !isSeller && (
            <li>
              <Link
                href={ROUTES.settings.seller}
                onClick={close}
                aria-current={pathname.startsWith(ROUTES.settings.seller) ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium transition-colors',
                  pathname.startsWith(ROUTES.settings.seller)
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
            <DrawerDisclosureGroup group={STORE_GROUP} pathname={pathname} onNavigate={close} />
          )}

          {/* عرض متجري — mirrors "عرض ملفي" above and ProtectedSidebar's
              identical entry; view-only link to the public storefront,
              shown once the store is ACTIVE (matches MyStoreCard's own
              gate on the same button). */}
          {isSeller && myStore?.status === 'ACTIVE' && (
            <li>
              <Link
                href={ROUTES.storeDetail(myStore.id)}
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

          <DrawerDisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} onNavigate={close} />

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
        </>,
        document.body,
      )}
    </>
  );
}
