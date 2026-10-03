// FIX SIDEBAR-ROLE-GATE-01: nav link visibility now fails closed --
// only a recognized admin-tier role (ADMIN/SUPER_ADMIN/MODERATOR) sees
// any links; previously every non-MODERATOR role (including undefined
// during loading) saw all of them.
'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, ShoppingBag, Users, Flag, FolderTree, UserCheck, Wrench, Store, ScrollText, BarChart3, Menu, X, Package, ShieldAlert,
  HeartPulse, ListOrdered, Bell, Search } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { canOpenAdminTab, isAdminTabActive, type AdminTab } from '@/lib/adminHubTabs';
import { useAdminOpsQueue } from '@/hooks/queries/useAdmin';
import { cn } from '@/lib/utils';
import { useAuthStore, selectUser } from '@/store/auth.store';

// ADMIN-HUB-01: every link is a TAB of /admin (lib/adminHubTabs.ts). Which
// tabs a MODERATOR may see is decided there (canOpenAdminTab) — one list
// instead of the tierRequired flags that used to be mirrored here and in the
// admin layout (and had drifted). badgeKey = live ops-queue counter.
const NAV_LINKS = [
  { tab: 'dashboard' as AdminTab, href: ROUTES.admin.dashboard,         label: 'الرئيسية',       icon: LayoutDashboard },
  { tab: 'ads' as AdminTab, href: ROUTES.admin.ads,               label: 'الإعلانات',      icon: ShoppingBag },
  { tab: 'users' as AdminTab, href: ROUTES.admin.users,             label: 'المستخدمون',     icon: Users },
  // EPIC 1.1: was entirely missing — see AdminSellersTable.tsx.
  { tab: 'sellers' as AdminTab, href: ROUTES.admin.sellers,           label: 'البائعون',       icon: UserCheck, badgeKey: 'pendingSellers' as const },
  // AUDIT-FIX (issue #1): was entirely missing — see AdminStoresTable.tsx.
  // Without this link, POST /stores had a working PENDING→ACTIVE
  // transition server-side but zero discoverable path to it.
  { tab: 'stores' as AdminTab, href: ROUTES.admin.stores,            label: 'المتاجر',        icon: Store, badgeKey: 'pendingStores' as const },
  { tab: 'store-types' as AdminTab, href: ROUTES.admin.storeTypes, label: 'أنواع المتاجر', icon: Store },
  { tab: 'reports' as AdminTab, href: ROUTES.admin.reports,           label: 'البلاغات',       icon: Flag, badgeKey: 'openReports' as const },
  // FRAUD-UI: fraud.routes.ts gates /admin/fraud at MODERATOR+ (same
  // tier as ads/reports above), same backend requireMinRole call —
  // no tierRequired, so a MODERATOR sees this link too.
  { tab: 'fraud' as AdminTab, href: ROUTES.admin.fraud,             label: 'مكافحة الاحتيال', icon: ShieldAlert, badgeKey: 'unreviewedFraud' as const },
  { tab: 'products' as AdminTab, href: ROUTES.admin.products,          label: 'المنتجات',       icon: Package },
  { tab: 'service-listings' as AdminTab, href: ROUTES.admin.serviceListings,   label: 'الخدمات',        icon: Wrench },
  { tab: 'open-requests' as AdminTab, href: ROUTES.admin.openRequests,      label: 'الطلبات المفتوحة', icon: ListOrdered },
  { tab: 'categories' as AdminTab, href: ROUTES.admin.categories,        label: 'فئات الإعلانات', icon: FolderTree },
  // EPIC 1.2: was entirely missing — see AdminServiceCategoriesTree.tsx.
  { tab: 'service-categories' as AdminTab, href: ROUTES.admin.serviceCategories, label: 'فئات الخدمات',   icon: Wrench },
  // Audit fix: was entirely missing despite full backend CRUD + a
  // mandatory role in ProductForm — see AdminProductCategoriesTree.tsx.
  { tab: 'product-categories' as AdminTab, href: ROUTES.admin.productCategories, label: 'فئات المنتجات',  icon: Package },
  { tab: 'notifications' as AdminTab, href: ROUTES.admin.notifications,     label: 'الإشعارات',      icon: Bell },
  // Audit Logs: GET /admin/audit-logs — see AdminAuditLogsTable.tsx.
  { tab: 'audit-logs' as AdminTab, href: ROUTES.admin.auditLogs,         label: 'سجل العمليات',   icon: ScrollText },
  // Gap #7 (product analytics): GET /admin/analytics/summary — see
  // AdminAnalyticsDashboard.tsx.
  { tab: 'analytics' as AdminTab, href: ROUTES.admin.analytics,         label: 'التحليلات',      icon: BarChart3 },
  { tab: 'system' as AdminTab, href: ROUTES.admin.system,            label: 'صحة النظام',     icon: HeartPulse },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const sp       = useSearchParams();
  const user     = useAuthStore(selectUser);
  const { data: queue } = useAdminOpsQueue();
  const [filter, setFilter] = useState('');
  // FIX SIDEBAR-ROLE-GATE-01: fail closed — only a recognized admin-tier role
  // sees any link (canOpenAdminTab is false for an unknown / missing role).
  // ADMIN-HUB-01: the tier table itself lives in lib/adminHubTabs.ts.
  const role   = user?.role;
  const search = sp.toString() ? `?${sp.toString()}` : '';

  const links = NAV_LINKS
    .filter((link) => canOpenAdminTab(link.tab, role))
    .filter((link) => !filter.trim() || link.label.includes(filter.trim()));

  return (
    <nav aria-label="قائمة الإدارة" className="space-y-1 p-3">
      <p className="text-xs font-semibold text-muted-foreground px-2 mb-2">
        لوحة الإدارة
      </p>
      {/* بحث سريع في القائمة — مفيد خاصة على الموبايل مع كثرة الروابط */}
      <div className="relative mb-3 px-1">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="بحث في القائمة…"
          className="h-9 w-full rounded-md border border-input bg-background pe-3 ps-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="بحث في قائمة الإدارة"
        />
      </div>
      {links.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">لا نتائج</p>
      )}
      {links.map((link) => {
        const { href, label, icon: Icon } = link;
        const isActive = isAdminTabActive(pathname, search, link.tab, role);
        const badgeKey = 'badgeKey' in link ? (link.badgeKey as
          'openReports' | 'pendingStores' | 'pendingSellers' | 'unreviewedFraud' | undefined) : undefined;
        const badge =
          badgeKey && queue && typeof queue[badgeKey] === 'number' ? queue[badgeKey] : 0;
        return (
          <Link prefetch={false}
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              // min-h for comfortable touch targets on mobile
              'flex min-h-[44px] items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors md:min-h-0',
              isActive
                ? 'bg-primary-soft text-primary shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span
                className={cn(
                  'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-bold tabular-nums',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-destructive text-destructive-foreground',
                )}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar — fixed, always visible on lg+ screens. */
function DesktopSidebar() {
  return (
    <aside className="sticky top-0 z-20 hidden h-screen w-52 shrink-0 overflow-y-auto border-e border-border/80 bg-surface-1 md:block lg:w-56">
      <NavLinks />
    </aside>
  );
}

/** Mobile drawer — slide-in sheet triggered by a hamburger button. */
function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 start-3 z-[70] p-2 rounded-md bg-card border shadow-sm min-h-11 min-w-11"
        aria-label="فتح القائمة"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="md:hidden fixed inset-0 z-[100]"
            role="dialog"
            aria-modal="true"
            aria-label="قائمة الإدارة"
          >
            <div
              className="absolute inset-0 bg-foreground/50 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 start-0 z-[101] h-full w-64 max-w-[85vw] overflow-y-auto border-e border-border bg-card shadow-xl">
              <button
                onClick={() => setOpen(false)}
                className="absolute top-3 end-3 z-[102] p-1 rounded-md hover:bg-muted"
                aria-label="إغلاق القائمة"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="pt-10">
                <NavLinks onNavigate={() => setOpen(false)} />
              </div>
            </div>
          </div>,
          document.body,
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
