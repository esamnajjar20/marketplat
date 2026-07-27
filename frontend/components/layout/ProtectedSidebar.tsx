/**
 * ProtectedSidebar — inline-start navigation for the authenticated section.
 *
 * UX-08 FIX: Added aria-current="page" on the active link so screen readers
 *   announce "current page" when the user focuses it.
 *
 * UX-09 FIX: border-r → border-e (CSS logical property). In RTL layouts
 *   border-r draws on the left side of the sidebar which is the wrong edge.
 *   border-e always draws on the inline-end edge regardless of direction.
 *
 * UX-15 FIX: Unicode icon spans now have aria-hidden="true" so screen
 *   readers don't read out "◈" or "♡" before each nav item label.
 */
'use client';

import Link           from 'next/link';
import { usePathname } from 'next/navigation';
import { cn }         from '@/lib/utils';
import { ROUTES }     from '@/lib/constants';

const NAV_ITEMS = [
  { label: 'لوحة التحكم', href: ROUTES.dashboard,        icon: '▦' },
  { label: 'إعلاناتي',    href: ROUTES.myAds,             icon: '◈' },
  { label: 'المفضلة',     href: ROUTES.favorites,         icon: '♡' },
  { label: 'الرسائل',     href: ROUTES.messages,          icon: '✉' },
  { label: 'الإعدادات',   href: ROUTES.settings.profile,  icon: '⚙', activeMatch: ROUTES.settings.root },
] as const;

export function ProtectedSidebar() {
  const pathname = usePathname();

  return (
    // UX-09 FIX: border-e is the logical equivalent of border-r, correct in RTL
    <aside className="hidden w-56 shrink-0 border-e bg-muted/20 lg:block">
      <nav aria-label="القائمة الشخصية" className="flex flex-col gap-1 p-4">
        {NAV_ITEMS.map((item) => {
          // Settings has its own activeMatch (its root '/settings') so any
          // sub-route (/settings/security, /settings/sessions, …) still
          // marks the single "الإعدادات" link active — startsWith(item.href)
          // alone only matched the exact profile sub-route.
          const isActive = pathname.startsWith((item as { activeMatch?: string }).activeMatch ?? item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              // UX-08 FIX: aria-current="page" on the active item
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {/* UX-15 FIX: aria-hidden so screen readers skip the Unicode symbol */}
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
