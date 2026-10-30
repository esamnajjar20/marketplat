'use client';

// FIX SIDEBAR-ROLE-GATE-01: nav link visibility now fails closed --
// only a recognized admin-tier role (ADMIN/SUPER_ADMIN/MODERATOR) sees
// any links; previously every non-MODERATOR role (including undefined
// during loading) saw all of them.

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, ShoppingBag, Users, Flag, FolderTree, UserCheck, Wrench, Store, ScrollText, BarChart3, Menu, X, Package, ShieldAlert,
  ListOrdered, Bell, Search, Activity } from 'lucide-react';
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
  { tab: 'service-types' as AdminTab, href: '/admin?tab=service-types', label: 'أنواع الخدمات', icon: Wrench },
  { tab: 'reports' as AdminTab, href: ROUTES.admin.reports,           label: 'البلاغات',       icon: Flag, badgeKey: 'openReports' as const },
  // FRAUD-UI: fraud.routes.ts gates /admin/fraud at MODERATOR+ (same
  // tier as ads/reports above), same backend requireMinRole call —
  // no tierRequired, so a MODERATOR sees this link too.
  { tab: 'fraud' as AdminTab, href: ROUTES.admin.fraud,             label: 'مكافحة الاحتيال', icon: ShieldAlert, badgeKey: 'unreviewedFraud' as const },
  { tab: 'products' as AdminTab, href: ROUTES.admin.products,          label: 'المنتجات',       icon: Package },
  { tab: 'service-listings' as AdminTab, href: ROUTES.admin.serviceListings,   label: 'الخدمات',        icon: Wrench },
  { tab: 'open-requests' as AdminTab, href: ROUTES.admin.openRequests,      label: 'الطلبات المفتوحة', icon: ListOrdered },
  { tab: 'service-request-disputes' as AdminTab, href: '/admin?tab=service-request-disputes', label: 'نزاعات الخدمات', icon: ShieldAlert },
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
  { tab: 'monitoring' as AdminTab, href: '/admin?tab=monitoring', label: 'المراقبة والتشخيص', icon: Activity },
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
    <nav aria-label="قائمة الإدارة" className="flex flex-col gap-0.5 p-3">
      <p className="px-2.5 pb-1.5 text-[13px] font-extrabold text-foreground">
        لوحة الإدارة
      </p>
      {/* بحث سريع في القائمة — مفيد خاصة على الموبايل مع كثرة الروابط */}
      <div className="relative mb-1.5">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="بحث في القائمة…"
          className="min-h-11 w-full rounded-[9px] border border-input bg-card pe-3 ps-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              // Design match: ~34px height, rounded-[9px], active = soft green + extrabold
              'flex min-h-11 items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-[13px] font-semibold transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ',
              isActive
                ? 'bg-primary-soft text-[#1F4D33] font-extrabold'
                : 'text-foreground hover:bg-muted/80',
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums bg-[#B3261E] text-white"
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

/** Desktop sidebar — fixed, always visible on lg+ screens. Design: 260px. */
function DesktopSidebar() {
  return (
    <aside className="sticky top-0 z-20 hidden h-screen w-[260px] shrink-0 overflow-y-auto border-e border-border/80 bg-card lg:block">
      <NavLinks />
    </aside>
  );
}

/** Mobile drawer — slide-in sheet triggered by a hamburger button. */
function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      firstFocusable?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
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
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 end-3 z-[70] flex h-11 w-11 items-center justify-center rounded-[10px] border border-border bg-card text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="فتح القائمة"
        aria-expanded={open}
        aria-controls="admin-navigation-dialog"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            className="lg:hidden fixed inset-0 z-[100]"
            id="admin-navigation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="قائمة الإدارة"
          >
            <div
              className="absolute inset-0 bg-foreground/50 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
            />
            <div ref={panelRef} className="absolute inset-y-0 start-0 z-[101] h-full w-[min(300px,88vw)] overflow-y-auto border-e border-[#EAE3D6] bg-card shadow-xl">
              <button
                onClick={() => setOpen(false)}
                className="absolute top-3 end-3 z-[102] flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
