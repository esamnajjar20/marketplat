'use client';
import { UserAvatar } from '@/components/shared/UserAvatar';
/**
 * MobileNav — slide-out sheet navigation for small screens.
 *
 * UX-06 FIX: Added explicit ✕ close button inside drawer + Escape key handler.
 * UX-07 FIX: end-0 (logical) instead of right-0 — RTL-safe drawer anchor.
 *
 * PRODUCT DECISION: drawer anchored to the right on every page (start-0,
 * which in this RTL app maps to right:0 — MDN: "with direction rtl,
 * inset-inline-start moves the element from the left side to the right
 * side"). transform is physical and never mirrors with dir="rtl" — a
 * right-anchored (start-0) drawer must translate RIGHT (positive
 * translate-x-full) to clear the viewport when closed.
 *
 * FIX UX-12: the link list used to be a single hardcoded constant that
 * always showed "تسجيل الدخول" / "إنشاء حساب", even to an already
 * logged-in user — unlike PublicHeader.tsx next to it, which correctly
 * branches on isAuthenticated. Now mirrors that same branch (plus
 * UserMenu.tsx's authenticated link set and a real logout action)
 * instead of a static list.
 *
 * UX-FIX (drawer audit): three changes together —
 *  1) Header: the drawer used to open straight into the link list with
 *     no identity context. Authenticated users now see the same
 *     avatar-circle + name pattern UserMenu.tsx already uses at desktop
 *     widths, so the drawer doesn't feel like a stripped-down fallback.
 *  2) Icons: every link now carries the matching lucide icon UserMenu.tsx
 *     and ProtectedSidebar already use elsewhere, so the list scans by
 *     shape, not just by reading every line.
 *  3) Grouping: nine-plus flat links are now split into labeled sections
 *     (mirrors the same "primary nav / your account / system" split the
 *     report asked for) with hairline separators, and logout is pulled
 *     out of the list entirely into its own bottom-anchored block so it
 *     can never be mistaken for a normal nav link.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link       from 'next/link';
import { usePathname } from 'next/navigation';
import { WithSearch } from '@/components/layout/WithSearch';
import {
  PlusCircle,
  LayoutDashboard, ListOrdered, Heart, BellPlus, History, Shield,
  LogIn, UserPlus, LogOut, Sun, Moon, MonitorSmartphone, ChevronDown, ChevronRight, User, Flag, Store,
} from 'lucide-react';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';
import { useAuthStore, selectIsAuthenticated, selectIsAdmin, selectUser } from '@/store/auth.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { ROUTES } from '@/lib/constants';
import { BROWSE_LINKS, SERVICES_GROUP, STORE_GROUP, settingsGroupFor, navChildIsActive, type NavDisclosureGroup } from '@/lib/navigation';
import { useIsSeller } from '@/hooks/queries/useSellers';
import { useIsProvider } from '@/hooks/queries/useServiceProviders';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;
const selectCloseMobileNav  = (s: ReturnType<typeof useUIStore.getState>) => s.closeMobileNav;

const GUEST_ACCOUNT_LINKS = [
  { label: 'تسجيل الدخول', href: ROUTES.login,    icon: LogIn },
  { label: 'إنشاء حساب',   href: ROUTES.register, icon: UserPlus },
] as const;

const AUTH_ACCOUNT_LINKS = [
  { label: 'لوحة التحكم',   href: ROUTES.dashboard,       icon: LayoutDashboard },
  { label: 'المفضلة',       href: ROUTES.favorites,       icon: Heart },
  { label: 'عمليات البحث المحفوظة', href: ROUTES.savedSearches, icon: BellPlus },
  { label: 'نشاطي',         href: ROUTES.activity,        icon: History },
] as const;

// SELLER-GATE: both require a SellerProfile server-side (ads.service.ts's
// createAd → ensureSellerProfileForAdCreation). Rendered separately from
// AUTH_ACCOUNT_LINKS below, gated on isSeller, same as
// ProtectedSidebar/ProtectedMobileNav/UserMenu.
const SELLER_ACCOUNT_LINKS = [
  { label: 'أضف إعلانك',   href: ROUTES.adCreate, icon: PlusCircle },
  { label: 'إعلاناتي',      href: ROUTES.myAds,    icon: ListOrdered },
] as const;

// PARITY-FIX: "بلاغاتي" — same gap as SERVICES_GROUP/STORE_GROUP below,
// mirrors ProtectedMobileNav's TRAILING_LINKS.
const TRAILING_LINKS = [
  { label: 'بلاغاتي', href: ROUTES.myReports, icon: Flag },
] as const;

// NAV-DEDUP: BROWSE_LINKS and SETTINGS_GROUP (used below as
// SETTINGS_GROUP.children) moved to lib/navigation.ts — both were
// byte-identical to ProtectedMobileNav's copies (SETTINGS_GROUP also
// matched ProtectedSidebar's). See that file's doc comment for the
// full reasoning.

const NAV_ID    = 'mobile-nav-drawer';
const TOGGLE_ID = 'mobile-nav-toggle';

/**
 * Inline light/dark/system segmented control for the drawer's "النظام"
 * section — a device preference belongs next to Settings, but as a
 * switcher rather than a link since it doesn't navigate anywhere.
 * Mirrors ThemeToggle.tsx's own mount guard: next-themes only knows
 * the real value client-side, so `theme` reads undefined until then.
 */
function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: 'light',  label: 'فاتح',       icon: Sun },
    { value: 'dark',   label: 'داكن',        icon: Moon },
    { value: 'system', label: 'النظام',      icon: MonitorSmartphone },
  ] as const;

  return (
    <div className="px-3 py-1">
      <p className="pb-1.5 text-xs font-medium text-muted-foreground">المظهر</p>
      <div className="flex gap-1 rounded-md border p-1">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={mounted && theme === value}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 rounded py-1.5 text-xs transition-colors',
              mounted && theme === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavSection({
  title,
  links,
  onNavigate,
}: {
  title?: string;
  links: readonly { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
  onNavigate: () => void;
}) {
  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0">
      {title && (
        <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{title}</p>
      )}
      <ul className="flex flex-col gap-1">
        {links.map(({ label, href, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              // FIX RSC-PREFETCH-STORM-01: mapped list in the mobile
              // drawer — see ExploreSheet.tsx for the full rationale.
              prefetch={false}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * FIX UX-SETTINGS-01: "النظام" section's settings row, replacing a
 * flat Link with the same expand-in-place disclosure ProtectedMobileNav
 * already uses for its groups — tap toggles the destination list
 * open/closed instead of navigating immediately.
 *
 * PARITY-FIX: generalized from a SETTINGS_GROUP-only row into a
 * reusable disclosure so it can also render SERVICES_GROUP/STORE_GROUP
 * below — this drawer previously had no path to "خدماتي"/"متجري"/
 * "بلاغاتي" at all (only ProtectedSidebar/ProtectedMobileNav did),
 * meaning a seller/provider opening the drawer from a public page had
 * no way to reach their store or services without detouring through
 * /dashboard first. Mirrors ProtectedMobileNav's DrawerDisclosureGroup.
 */
function DisclosureGroup({
  group, pathname, onNavigate, search = '',
}: {
  group: typeof SERVICES_GROUP | typeof STORE_GROUP | NavDisclosureGroup;
  pathname: string;
  onNavigate: () => void;
  search?: string;
}) {
  const isAnyChildActive = group.children.some((c) => navChildIsActive(pathname, c, search));
  const [isOpen, setIsOpen] = useState(isAnyChildActive);
  const Icon = group.icon;

  return (
    <li>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors',
          isAnyChildActive && !isOpen ? 'bg-muted' : 'hover:bg-muted',
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-start">{group.label}</span>
        {isOpen
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </button>
      {isOpen && (
        <ul className="mt-1 flex flex-col gap-1">
          {group.children.map((child) => {
            const isActive = navChildIsActive(pathname, child, search);
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2 ms-7 text-base font-medium transition-colors',
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

export function MobileNav() {
  const pathname = usePathname();
  const isMobileNavOpen = useUIStore(selectIsMobileNavOpen);
  const toggleMobileNav = useUIStore(selectToggleMobileNav);
  const closeMobileNav  = useUIStore(selectCloseMobileNav);
  const closeButtonRef  = useRef<HTMLButtonElement>(null);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAdmin         = useAuthStore(selectIsAdmin);
  const user             = useAuthStore(selectUser);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  // PARITY-FIX: same "isSuccess && data is the only positive signal"
  // gating ProtectedSidebar/ProtectedMobileNav use — loading, 404, and
  // a genuine fetch error all render identically as the CTA row, no
  // isError branch. Safe to call unconditionally: both hooks gate
  // their query on isAuthenticated internally, so this issues no
  // request at all for guests.
  const { isSeller, isLoaded: sellerLoaded } = useIsSeller();
  const { isProvider } = useIsProvider();

  // FIX UI-05: document.body isn't available during SSR, and even on
  // the client, createPortal needs a mounted DOM node to portal into
  // — rendering it on the very first client render (before React has
  // hydrated/committed) would still throw. Delaying the portal until
  // after mount is the standard pattern for this; the drawer is closed
  // by default anyway, so the one-render delay is invisible.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // UX-06 FIX: close on Escape
  useEffect(() => {
    if (!isMobileNavOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMobileNav();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobileNavOpen, closeMobileNav]);

  // BUG FIX: opening this drawer previously left <body> free to scroll
  // — the page underneath kept scrolling along with (or independently
  // of) the fixed-positioned drawer. Locking <body> overflow while open
  // is the standard fix; restored on close/unmount. Same fix applied
  // to ProtectedMobileNav's identical drawer.
  useEffect(() => {
    if (!isMobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileNavOpen]);

  // SW-FIX-MN-FOCUS-MOUNT: mirrors ProtectedMobileNav's fix (#52) —
  // the previous version unconditionally focused the toggle on first
  // mount with the drawer closed, yanking keyboard focus to the
  // hamburger just from landing on the page. Only restore focus after
  // the drawer has actually been open once.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isMobileNavOpen) {
      wasOpenRef.current = true;
      closeButtonRef.current?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      (document.getElementById(TOGGLE_ID) as HTMLButtonElement | null)?.focus();
    }
  }, [isMobileNavOpen]);

  return (
    <>
      {/* Hamburger toggle — stays inline in the header; only the
          backdrop + drawer below need the portal. */}
      <button
        id={TOGGLE_ID}
        onClick={toggleMobileNav}
        className="rounded p-2 hover:bg-muted"
        aria-label={isMobileNavOpen ? 'أغلق القائمة' : 'افتح القائمة'}
        aria-expanded={isMobileNavOpen}
        aria-controls={NAV_ID}
      >
        <span aria-hidden="true" className="block h-0.5 w-5 bg-foreground" />
        <span aria-hidden="true" className="mt-1 block h-0.5 w-5 bg-foreground" />
        <span aria-hidden="true" className="mt-1 block h-0.5 w-5 bg-foreground" />
      </button>

      {/*
       * FIX UI-05: the backdrop + drawer used to render as a plain
       * sibling right here, inside PublicHeader/ProtectedHeader's own
       * DOM tree. Both headers have backdrop-blur on their <header>
       * element (for the frosted sticky-nav effect) — and per the CSS
       * spec, any element with a filter/backdrop-filter other than
       * `none` becomes the containing block for its position: fixed
       * descendants. So this drawer's `fixed inset-y-0 right-0` was
       * being positioned relative to the header's own box, not the
       * viewport — it opened pinned to the header's height instead of
       * covering the screen (visually: a strip trapped under the top
       * bar rather than a full-height slide-out sheet).
       *
       * Portalling straight to document.body escapes that containing
       * block entirely, same as a modal/dialog would need to. mounted
       * guards against calling document.body before the client has
       * hydrated (see the mounted state above).
       */}
      {mounted && createPortal(
        <>
          {/* Backdrop */}
          {isMobileNavOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={closeMobileNav}
              aria-hidden="true"
            />
          )}

          {/* Drawer — start-0 is logical, and in this RTL app (dir="rtl")
              resolves to right:0 (drawer is anchored to the RIGHT edge —
              MDN: inset-inline-start maps to right when direction is
              rtl). transform is a PHYSICAL property and is NEVER
              mirrored by dir="rtl". A right-anchored (start-0) drawer
              must translate RIGHT (positive translate-x-full) to clear
              the viewport when closed — negative translate-x-full
              instead pushes it left onto the visible screen area. Kept
              in sync with ProtectedMobileNav.tsx's identical drawer so
              the side menu opens from the same edge on every page. */}
          <nav
            id={NAV_ID}
            // FIX MOBILE-01: max-w-[85vw] — see identical fix in
            // ProtectedMobileNav.tsx.
            className={`fixed inset-y-0 right-0 z-[60] flex w-72 max-w-[85vw] flex-col bg-background shadow-xl transition-transform duration-200 ${
              isMobileNavOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            aria-label="القائمة الرئيسية"
            // SW-FIX-DRAWER-INERT: same fix as ProtectedMobileNav.tsx —
            // React 19's native `inert` replaces the
            // aria-hidden-on-non-inert-container pattern.
            inert={!isMobileNavOpen}
          >
          {/* Header: identity context when logged in, otherwise just the
              title + close button. Kept outside the scrollable list below
              so it stays pinned while links scroll. */}
          {/* FIX PWA-STANDALONE: in standalone/TWA display mode (viewportFit:
              'cover' + statusBarStyle: 'black-translucent' in layout.tsx),
              there's no browser chrome to push this fixed drawer's top:0
              below the OS status bar — the header rendered clipped under
              it. p-4's flat 1rem top padding wasn't enough to clear the
              status bar height; pt-[max(...)] mirrors the same
              env(safe-area-inset-top) pattern NetworkStatusBanner.tsx
              already uses, so it only adds extra top space where a safe
              area actually exists (installed app) and stays 1rem
              everywhere else (browser tab). */}
          <div className="shrink-0 border-b p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between">
              {isAuthenticated && user ? (
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={40} />
                  <span className="min-w-0 truncate text-sm font-semibold">{user.name}</span>
                </div>
              ) : (
                <span className="text-base font-semibold">القائمة</span>
              )}
              <button
                ref={closeButtonRef}
                onClick={closeMobileNav}
                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
                aria-label="أغلق القائمة"
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <NavSection title="تصفح" links={BROWSE_LINKS} onNavigate={closeMobileNav} />
            {isAuthenticated ? (
              <>
                <NavSection title="حسابك" links={AUTH_ACCOUNT_LINKS} onNavigate={closeMobileNav} />

                {/* SELLER-GATE: "أضف إعلانك"/"إعلاناتي" moved out of
                    AUTH_ACCOUNT_LINKS above — both require a
                    SellerProfile server-side. Same isSeller gate as
                    STORE_GROUP below. */}
                {isSeller && (
                  <NavSection links={SELLER_ACCOUNT_LINKS} onNavigate={closeMobileNav} />
                )}

                {/* SELLER-CTA: mirrors ProtectedSidebar/ProtectedMobileNav/
                    UserMenu — shown only while sellerLoaded &&
                    !sellerProfile, links to /settings/seller. */}
                {sellerLoaded && !isSeller && (
                  <div className="border-t pt-3">
                    <ul className="flex flex-col gap-1">
                      <li>
                        <Link
                          href={ROUTES.settings.seller}
                          onClick={closeMobileNav}
                          aria-current={pathname === ROUTES.settings.root ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors',
                            pathname === ROUTES.settings.root
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted',
                          )}
                        >
                          <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
                          أنشئ حساب بائع
                        </Link>
                      </li>
                    </ul>
                  </div>
                )}
                {/* عرض الملف الشخصي — kept out of AUTH_ACCOUNT_LINKS
                    (which has no user.id to build the href with).
                    Mirrors the identical entry in ProtectedMobileNav/
                    ProtectedSidebar/UserMenu so all four navs stay in
                    sync. */}
                {user && (
                  <div className="border-t pt-3">
                    <ul className="flex flex-col gap-1">
                      <li>
                        <Link
                          href={ROUTES.userProfile(user.id)}
                          onClick={closeMobileNav}
                          aria-current={pathname.startsWith(ROUTES.userProfile(user.id)) ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors',
                            pathname.startsWith(ROUTES.userProfile(user.id))
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted',
                          )}
                        >
                          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                          عرض ملفي
                        </Link>
                      </li>
                    </ul>
                  </div>
                )}
                {/* PARITY-FIX: "خدماتي"/"متجري"/"بلاغاتي" were entirely
                    absent from this drawer — a seller/provider opening
                    it from a public page (home, a store page, an ad)
                    had no way to reach their store or services without
                    detouring through /dashboard first. Same structure
                    as ProtectedMobileNav's identical section. */}
                <div className="border-t pt-3">
                  <ul className="flex flex-col gap-1">
                    {/* AUDIT-FIX (dynamic sidebar): mirrors
                        ProtectedSidebar/ProtectedMobileNav's identical
                        fix - sections for roles the user doesn't hold
                        are fully absent, no CTA row. /settings/seller
                        and /settings/service-provider unchanged and
                        still reachable through settings. */}
                    {isProvider && (
                      <DisclosureGroup group={SERVICES_GROUP} pathname={pathname} onNavigate={closeMobileNav} />
                    )}
                    {isSeller && (
                      <DisclosureGroup group={STORE_GROUP} pathname={pathname} onNavigate={closeMobileNav} />
                    )}

                    {TRAILING_LINKS.map((link) => {
                      const isActive = pathname.startsWith(link.href);
                      return (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            onClick={closeMobileNav}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                              'flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors',
                              isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                            )}
                          >
                            <link.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            {link.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="border-t pt-3">
                  <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">النظام</p>
                  <ul className="flex flex-col gap-1">
                    <Suspense fallback={<DisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} onNavigate={closeMobileNav} />}>
                      <WithSearch>
                        {(search) => (
                          <DisclosureGroup group={settingsGroupFor(isSeller)} pathname={pathname} onNavigate={closeMobileNav} search={search} />
                        )}
                      </WithSearch>
                    </Suspense>
                    {isAdmin && (
                      <li>
                        <Link
                          href={ROUTES.admin.dashboard}
                          onClick={closeMobileNav}
                          className="flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
                        >
                          <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                          لوحة الإدارة
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
                <div className="border-t pt-3">
                  <ThemeRow />
                </div>
              </>
            ) : (
              <>
                <NavSection title="حسابك" links={GUEST_ACCOUNT_LINKS} onNavigate={closeMobileNav} />
                <div className="border-t pt-3">
                  <ThemeRow />
                </div>
              </>
            )}
          </div>

          {/* Logout: pulled out of the link list and separated with its
              own border so it reads as a distinct, deliberate action
              rather than another destination in the nav. */}
          {isAuthenticated && (
            <div className="shrink-0 border-t p-4">
              <button
                onClick={() => { logout(); closeMobileNav(); }}
                disabled={isLoggingOut}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-base font-medium text-destructive hover:bg-muted disabled:opacity-50"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {isLoggingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
              </button>
            </div>
          )}
        </nav>
        </>,
        document.body
      )}
    </>
  );
}
