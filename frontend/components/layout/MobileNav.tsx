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
 */
'use client';

import { useEffect, useRef } from 'react';
import Link       from 'next/link';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';
import { useAuthStore, selectIsAuthenticated, selectIsAdmin } from '@/store/auth.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { ROUTES } from '@/lib/constants';

const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;
const selectCloseMobileNav  = (s: ReturnType<typeof useUIStore.getState>) => s.closeMobileNav;

const GUEST_LINKS = [
  { label: 'الرئيسية',      href: ROUTES.home },
  { label: 'البحث',         href: ROUTES.search },
  { label: 'تسجيل الدخول', href: ROUTES.login },
  { label: 'إنشاء حساب',   href: ROUTES.register },
] as const;

const AUTH_LINKS = [
  { label: 'الرئيسية',      href: ROUTES.home },
  { label: 'البحث',         href: ROUTES.search },
  { label: 'أضف إعلانك',   href: ROUTES.adCreate },
  { label: 'لوحة التحكم',   href: ROUTES.dashboard },
  { label: 'إعلاناتي',      href: ROUTES.myAds },
  { label: 'المفضلة',       href: ROUTES.favorites },
  { label: 'الإعدادات',     href: ROUTES.settings.profile },
] as const;

const NAV_ID    = 'mobile-nav-drawer';
const TOGGLE_ID = 'mobile-nav-toggle';

export function MobileNav() {
  const isMobileNavOpen = useUIStore(selectIsMobileNavOpen);
  const toggleMobileNav = useUIStore(selectToggleMobileNav);
  const closeMobileNav  = useUIStore(selectCloseMobileNav);
  const closeButtonRef  = useRef<HTMLButtonElement>(null);

  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAdmin         = useAuthStore(selectIsAdmin);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  const links = isAuthenticated
    ? [...AUTH_LINKS, ...(isAdmin ? [{ label: 'لوحة الإدارة', href: ROUTES.admin.dashboard }] : [])]
    : GUEST_LINKS;

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
      {/* Hamburger toggle */}
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

      {/* Backdrop */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={closeMobileNav}
          aria-hidden="true"
        />
      )}

      {/* Drawer — UX-07 FIX: end-0 is logical (right in LTR, left in RTL) */}
      <nav
        id={NAV_ID}
        className={`fixed inset-y-0 end-0 z-50 w-72 bg-background p-6 shadow-xl transition-transform duration-200 ${
          isMobileNavOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="القائمة الرئيسية"
        aria-hidden={!isMobileNavOpen}
      >
        {/* UX-06 FIX: explicit close button */}
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">القائمة</span>
          <button
            ref={closeButtonRef}
            onClick={closeMobileNav}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="أغلق القائمة"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <ul className="mt-6 flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={closeMobileNav}
                className="block rounded-md px-3 py-2 text-base font-medium hover:bg-muted"
              >
                {link.label}
              </Link>
            </li>
          ))}
          {isAuthenticated && (
            <li>
              <button
                onClick={() => { logout(); closeMobileNav(); }}
                disabled={isLoggingOut}
                className="block w-full text-start rounded-md px-3 py-2 text-base font-medium text-destructive hover:bg-muted disabled:opacity-50"
              >
                {isLoggingOut ? 'جارٍ تسجيل الخروج…' : 'تسجيل الخروج'}
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}
