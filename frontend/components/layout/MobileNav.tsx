/**
 * MobileNav — slide-out sheet navigation for small screens.
 *
 * UX-06 FIX: Added explicit ✕ close button inside drawer + Escape key handler.
 * UX-07 FIX: end-0 (logical) instead of right-0 — RTL-safe drawer anchor.
 *            translate-x-full still works: in RTL the browser already
 *            mirrors the transform direction for end-anchored elements.
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
'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link       from 'next/link';
import {
  Home, Search, Store, Wrench, Users, PlusCircle,
  LayoutDashboard, ListOrdered, Heart, BellPlus, Settings, Shield,
  LogIn, UserPlus, LogOut, Sun, Moon, MonitorSmartphone,
} from 'lucide-react';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';
import { useAuthStore, selectIsAuthenticated, selectIsAdmin, selectUser } from '@/store/auth.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { ROUTES } from '@/lib/constants';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;
const selectCloseMobileNav  = (s: ReturnType<typeof useUIStore.getState>) => s.closeMobileNav;

// AUDIT-FIX (issue #3 — 🔴 critical): stores/services/service-providers
// had no entry point anywhere in primary navigation — same gap as
// PublicHeader.tsx, mirrored here for the mobile drawer.
const BROWSE_LINKS = [
  { label: 'الرئيسية',      href: ROUTES.home,             icon: Home },
  { label: 'البحث',         href: ROUTES.search,           icon: Search },
  { label: 'المتاجر',       href: ROUTES.stores,           icon: Store },
  { label: 'الخدمات',       href: ROUTES.services,         icon: Wrench },
  { label: 'مقدمو الخدمة',  href: ROUTES.serviceProviders, icon: Users },
] as const;

const GUEST_ACCOUNT_LINKS = [
  { label: 'تسجيل الدخول', href: ROUTES.login,    icon: LogIn },
  { label: 'إنشاء حساب',   href: ROUTES.register, icon: UserPlus },
] as const;

const AUTH_ACCOUNT_LINKS = [
  { label: 'أضف إعلانك',   href: ROUTES.adCreate,        icon: PlusCircle },
  { label: 'لوحة التحكم',   href: ROUTES.dashboard,       icon: LayoutDashboard },
  { label: 'إعلاناتي',      href: ROUTES.myAds,           icon: ListOrdered },
  { label: 'المفضلة',       href: ROUTES.favorites,       icon: Heart },
  { label: 'البحثات المحفوظة', href: ROUTES.savedSearches, icon: BellPlus },
] as const;

const SYSTEM_LINKS = [
  { label: 'الإعدادات', href: ROUTES.settings.profile, icon: Settings },
] as const;

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

export function MobileNav() {
  const isMobileNavOpen = useUIStore(selectIsMobileNavOpen);
  const toggleMobileNav = useUIStore(selectToggleMobileNav);
  const closeMobileNav  = useUIStore(selectCloseMobileNav);
  const closeButtonRef  = useRef<HTMLButtonElement>(null);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAdmin         = useAuthStore(selectIsAdmin);
  const user             = useAuthStore(selectUser);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

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

  // Move focus into drawer when opened; restore to toggle when closed
  useEffect(() => {
    if (isMobileNavOpen) {
      closeButtonRef.current?.focus();
    } else {
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
       * descendants. So this drawer's `fixed inset-y-0 end-0` was
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

          {/* Drawer — end-0 is logical (right in LTR, left in RTL).
              translate-x-full is a PHYSICAL property (always moves toward
              +X / visual right) — it does NOT flip with dir="rtl" the way
              end-0 does. Since this app is RTL-only (dir="rtl" on <html>),
              the closed state must slide toward the left (-translate-x-full)
              to match the drawer's left-anchored (end-0) position. */}
          <nav
            id={NAV_ID}
            className={`fixed inset-y-0 end-0 z-[60] flex w-72 flex-col bg-background shadow-xl transition-transform duration-200 ${
              isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            aria-label="القائمة الرئيسية"
            aria-hidden={!isMobileNavOpen}
          >
          {/* Header: identity context when logged in, otherwise just the
              title + close button. Kept outside the scrollable list below
              so it stays pinned while links scroll. */}
          <div className="shrink-0 border-b p-4">
            <div className="flex items-center justify-between">
              {isAuthenticated && user ? (
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
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
                <NavSection
                  title="النظام"
                  links={isAdmin ? [...SYSTEM_LINKS, { label: 'لوحة الإدارة', href: ROUTES.admin.dashboard, icon: Shield }] : SYSTEM_LINKS}
                  onNavigate={closeMobileNav}
                />
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
