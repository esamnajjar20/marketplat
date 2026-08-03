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
 */
'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';
import { useLogout } from '@/hooks/mutations/useAuthMutations';
import { useAuthStore, selectIsAdmin } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';

const selectCloseMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.closeMobileNav;
const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;

const LINKS = [
  { label: 'لوحة التحكم', href: ROUTES.dashboard },
  { label: 'إعلاناتي', href: ROUTES.myAds },
  { label: 'المفضلة', href: ROUTES.favorites },
  { label: 'الرسائل', href: ROUTES.messages },
  { label: 'البحثات المحفوظة', href: ROUTES.savedSearches },
  { label: 'خدماتي', href: ROUTES.myServices },
  { label: 'متجري', href: ROUTES.myStore },
  { label: 'الإعدادات', href: ROUTES.settings.profile, activeMatch: ROUTES.settings.root },
] as const;

const NAV_ID = 'protected-mobile-nav-drawer';
const TOGGLE_ID = 'protected-mobile-nav-toggle';

export function ProtectedMobileNav() {
  const isOpen = useUIStore(selectIsMobileNavOpen);
  const toggle = useUIStore(selectToggleMobileNav);
  const close = useUIStore(selectCloseMobileNav);
  const pathname = usePathname();
  const isAdmin = useAuthStore(selectIsAdmin);
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

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
          'fixed inset-y-0 end-0 z-[60] w-72 bg-background p-6 shadow-xl transition-transform duration-200 lg:hidden',
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

        <ul className="mt-6 flex flex-col gap-1">
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
