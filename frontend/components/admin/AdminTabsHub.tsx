'use client';

/**
 * ADMIN-HUB-01 — one page for the whole admin panel.
 *
 * Replaces the 17 near-identical app/(admin)/admin/<section>/page.tsx files
 * (and 11 loading.tsx skeletons). The section lives in `?tab=…`
 * (lib/adminHubTabs.ts); legacy /admin/<section> URLs redirect here from
 * next.config.ts.
 *
 * Differences from the user-facing hubs (TabsHub), on purpose:
 *  - No in-page tab strip. AdminSidebar (desktop) and its drawer (mobile) are
 *    the switcher: 17 sections with live badges and a filter box, which a pill
 *    row cannot replace. Switching is a normal <Link> navigation to
 *    `/admin?tab=…`, so the URL — read here with useSearchParams — is the only
 *    source of truth (no local state to keep in sync).
 *  - Admin is online-only, so there is no replaceState / offline-warming
 *    constraint; AdminAnalyticsDashboard stays behind next/dynamic to keep its
 *    chart code out of every other tab.
 *  - Role tiers: a MODERATOR asking for a tab outside their tier is told why
 *    and sent to their default tab. The backend (requireMinRole) is the real
 *    boundary; this is routing convenience.
 */

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import {
  adminTabHref,
  canOpenAdminTab,
  defaultAdminTabForRole,
  effectiveAdminTab,
  resolveAdminTab,
  type AdminTab,
} from '@/lib/adminHubTabs';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AdminExportButton } from '@/components/admin/AdminExportButton';
import { AdminStatsGrid } from '@/components/admin/AdminStatsGrid';
import { AdminRecentActivity } from '@/components/admin/AdminRecentActivity';
import { BroadcastNotificationButton } from '@/components/admin/BroadcastNotificationButton';
import { AdminOpsQueue } from '@/components/admin/AdminOpsQueue';
import { AdminPlatformTrends } from '@/components/admin/AdminPlatformTrends';
import { AdminAdsTable } from '@/components/admin/AdminAdsTable';
import { AdminUsersTable } from '@/components/admin/AdminUsersTable';
import { AdminSellersTable } from '@/components/admin/AdminSellersTable';
import { AdminStoresTable } from '@/components/admin/AdminStoresTable';
import { AdminReportsTable } from '@/components/admin/AdminReportsTable';
import { AdminFraudTable } from '@/components/admin/AdminFraudTable';
import { AdminProductsTable } from '@/components/admin/AdminProductsTable';
import { AdminServiceListingsTable } from '@/components/admin/AdminServiceListingsTable';
import { AdminOpenRequestsTable } from '@/components/admin/AdminOpenRequestsTable';
import { AdminCategoryTypeTabs } from '@/components/admin/AdminCategoryTypeTabs';
import { AdminCategoriesTree } from '@/components/admin/AdminCategoriesTree';
import { AdminProductCategoriesTree } from '@/components/admin/AdminProductCategoriesTree';
import { AdminServiceCategoriesTree } from '@/components/admin/AdminServiceCategoriesTree';
import { CreateCategoryButton } from '@/components/admin/CreateCategoryButton';
import { CreateProductCategoryButton } from '@/components/admin/CreateProductCategoryButton';
import { CreateServiceCategoryButton } from '@/components/admin/CreateServiceCategoryButton';
import { AdminAuditLogsTable } from '@/components/admin/AdminAuditLogsTable';
import { AdminSystemHealth } from '@/components/admin/AdminSystemHealth';
import { AdminSystemTools } from '@/components/admin/AdminSystemTools';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

const AdminAnalyticsDashboard = dynamic(
  () =>
    import('@/components/admin/AdminAnalyticsDashboard').then((m) => m.AdminAnalyticsDashboard),
  {
    loading: () => (
      <PageLoadingState variant="cards" title="جارٍ تحميل التحليلات" description="…" />
    ),
  },
);

const tableFallback = (
  <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز الجدول…" />
);
const spinnerFallback = (
  <div className="flex justify-center py-12">
    <LoadingSpinner />
  </div>
);

function TabBody({ tab }: { tab: AdminTab }) {
  switch (tab) {
    case 'ads':
      return (
        <AdminPageShell
          title="إدارة الإعلانات"
          description="مراجعة الإعلانات، الحالة، والإجراءات الجماعية."
        >
          <Suspense fallback={tableFallback}>
            <AdminAdsTable />
          </Suspense>
        </AdminPageShell>
      );
    case 'users':
      return (
        <AdminPageShell
          title="إدارة المستخدمين"
          description="حسابات، أدوار، وحالة الحساب."
          actions={<AdminExportButton kind="users" label="تصدير CSV" />}
        >
          <Suspense fallback={tableFallback}>
            <AdminUsersTable />
          </Suspense>
        </AdminPageShell>
      );
    case 'sellers':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">إدارة البائعين</h1>
          <Suspense fallback={spinnerFallback}>
            <AdminSellersTable />
          </Suspense>
        </div>
      );
    case 'stores':
      return (
        <AdminPageShell title="إدارة المتاجر" description="المتاجر والخطة والحالة.">
          <Suspense fallback={tableFallback}>
            <AdminStoresTable />
          </Suspense>
        </AdminPageShell>
      );
    case 'reports':
      return (
        <AdminPageShell
          title="البلاغات"
          description="بلاغات قيد المراجعة والإجراءات."
          actions={<AdminExportButton kind="reports" label="تصدير CSV" />}
        >
          <Suspense fallback={tableFallback}>
            <AdminReportsTable />
          </Suspense>
        </AdminPageShell>
      );
    case 'fraud':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">مكافحة الاحتيال</h1>
          <Suspense fallback={spinnerFallback}>
            <AdminFraudTable />
          </Suspense>
        </div>
      );
    case 'products':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">المنتجات</h1>
          <Suspense>
            <AdminProductsTable />
          </Suspense>
        </div>
      );
    case 'service-listings':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">عروض الخدمات</h1>
          <Suspense>
            <AdminServiceListingsTable />
          </Suspense>
        </div>
      );
    case 'open-requests':
      return (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold">الطلبات المفتوحة</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              طلبات الخدمة والمنتج والإيجار — مراجعة وإلغاء الطلبات عند الحاجة.
            </p>
          </div>
          <Suspense>
            <AdminOpenRequestsTable />
          </Suspense>
        </div>
      );
    case 'categories':
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">إدارة الفئات</h1>
            <CreateCategoryButton />
          </div>
          <AdminCategoryTypeTabs active="categories" />
          <AdminCategoriesTree />
        </div>
      );
    case 'product-categories':
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">إدارة فئات المنتجات</h1>
            <CreateProductCategoryButton />
          </div>
          <AdminCategoryTypeTabs active="product-categories" />
          <AdminProductCategoriesTree />
        </div>
      );
    case 'service-categories':
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">إدارة فئات الخدمات</h1>
            <CreateServiceCategoryButton />
          </div>
          <AdminCategoryTypeTabs active="service-categories" />
          <AdminServiceCategoriesTree />
        </div>
      );
    case 'notifications':
      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">الإشعارات</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                بث إشعارات ترويجية لجميع المستخدمين أو مجموعة محددة، ومتابعة الإحصائيات.
              </p>
            </div>
            <BroadcastNotificationButton />
          </div>
        </div>
      );
    case 'audit-logs':
      return (
        <div className="space-y-4">
          <h1 className="text-xl font-bold">سجل العمليات</h1>
          <Suspense fallback={spinnerFallback}>
            <AdminAuditLogsTable />
          </Suspense>
        </div>
      );
    case 'analytics':
      return (
        <div className="space-y-6">
          <h1 className="text-xl font-bold">التحليلات</h1>
          <AdminAnalyticsDashboard />
        </div>
      );
    case 'system':
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold">صحة النظام والأدوات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              فحص الخدمات الحية وأدوات تشغيلية سريعة للمشرف.
            </p>
          </div>
          <AdminSystemHealth />
          <AdminSystemTools />
          <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">روابط سريعة</h2>
            <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <li>
                <Link prefetch={false} href={ROUTES.admin.auditLogs} className="text-primary hover:underline">
                  سجل العمليات
                </Link>
              </li>
              <li>
                <Link prefetch={false} href={ROUTES.admin.analytics} className="text-primary hover:underline">
                  التحليلات
                </Link>
              </li>
              <li>
                <Link prefetch={false} href={ROUTES.admin.notifications} className="text-primary hover:underline">
                  إدارة الإشعارات
                </Link>
              </li>
              <li>
                <Link prefetch={false} href={ROUTES.admin.fraud} className="text-primary hover:underline">
                  مكافحة الاحتيال
                </Link>
              </li>
            </ul>
          </div>
        </div>
      );
    case 'dashboard':
    default:
      return (
        <AdminPageShell
          title="نظرة عامة"
          description="ملخص المنصة، الطوابير، وأحدث النشاط."
          actions={<BroadcastNotificationButton />}
        >
          <AdminOpsQueue />
          <AdminPlatformTrends />
          <AdminStatsGrid />
          <section className="space-y-3">
            <h2 className="text-base font-semibold">أحدث الإعلانات</h2>
            <AdminRecentActivity />
          </section>
        </AdminPageShell>
      );
  }
}

export function AdminTabsHub() {
  const sp = useSearchParams();
  const router = useRouter();
  const role = useAuthStore(selectUser)?.role;

  const search = sp.toString() ? `?${sp.toString()}` : '';
  const requested = resolveAdminTab(search);
  const active = effectiveAdminTab(search, role);

  // A MODERATOR who typed / followed a link to a tier-restricted section:
  // explain, then move them to their default tab (same treatment the layout
  // gives other out-of-scope pages).
  const blocked = role === 'MODERATOR' && requested !== null && !canOpenAdminTab(requested, role);
  useEffect(() => {
    if (!blocked) return;
    toast.error('هذا القسم غير متاح لدور المشرف المساعد');
    router.replace(adminTabHref(defaultAdminTabForRole(role)));
  }, [blocked, role, router]);

  if (blocked) return null;

  return <TabBody tab={active} />;
}
