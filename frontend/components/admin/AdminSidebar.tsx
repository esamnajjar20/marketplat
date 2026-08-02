'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShoppingBag, Users, Flag, FolderTree, UserCheck, Wrench, Store, ScrollText, Menu, X } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: ROUTES.admin.dashboard,         label: 'الرئيسية',       icon: LayoutDashboard },
  { href: ROUTES.admin.ads,               label: 'الإعلانات',      icon: ShoppingBag },
  { href: ROUTES.admin.users,             label: 'المستخدمون',     icon: Users },
  // EPIC 1.1: was entirely missing — see AdminSellersTable.tsx.
  { href: ROUTES.admin.sellers,           label: 'البائعون',       icon: UserCheck },
  // AUDIT-FIX (issue #1): was entirely missing — see AdminStoresTable.tsx.
  // Without this link, POST /stores had a working PENDING→ACTIVE
  // transition server-side but zero discoverable path to it.
  { href: ROUTES.admin.stores,            label: 'المتاجر',        icon: Store },
  { href: ROUTES.admin.reports,           label: 'البلاغات',       icon: Flag },
  { href: ROUTES.admin.categories,        label: 'فئات الإعلانات', icon: FolderTree },
  // EPIC 1.2: was entirely missing — see AdminServiceCategoriesTree.tsx.
  { href: ROUTES.admin.serviceCategories, label: 'فئات الخدمات',   icon: Wrench },
  // Audit Logs: GET /admin/audit-logs — see AdminAuditLogsTable.tsx.
  { href: ROUTES.admin.auditLogs,         label: 'سجل العمليات',   icon: ScrollText },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="قائمة الإدارة" className="space-y-1 p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-4">
        لوحة الإدارة
      </p>
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar — fixed, always visible on lg+ screens. */
function DesktopSidebar() {
  return (
    <aside className="hidden lg:block w-56 shrink-0 border-e bg-card min-h-screen">
      <NavLinks />
    </aside>
  );
}

/** Mobile drawer — slide-in sheet triggered by a hamburger button. */
function MobileDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 end-3 z-40 p-2 rounded-md bg-card border shadow-sm"
        aria-label="فتح القائمة"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="قائمة الإدارة"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          {/* Drawer panel — appears on the end side for RTL */}
          <div className="relative ms-auto w-64 bg-card h-full shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 start-3 p-1 rounded-md hover:bg-muted"
              aria-label="إغلاق القائمة"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="pt-10">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** AdminSidebar renders both variants — CSS controls which one is visible. */
export function AdminSidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileDrawer />
    </>
  );
}
