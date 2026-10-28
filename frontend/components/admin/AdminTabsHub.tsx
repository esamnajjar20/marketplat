'use client';

/**
 * ADMIN-HUB-01 — one page for the whole admin panel.
 *
 * Replaces the 18 near-identical app/(admin)/admin/<section>/page.tsx files
 * (and 11 loading.tsx skeletons). The section lives in `?tab=…`
 * (lib/adminHubTabs.ts); legacy /admin/<section> URLs redirect here from
 * next.config.ts.
 *
 * Differences from the user-facing hubs (TabsHub), on purpose:
 *  - No in-page tab strip. AdminSidebar (desktop) and its drawer (mobile) are
 *    the switcher: 18 sections with live badges and a filter box, which a pill
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
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore, selectUser } from '@/store/auth.store';
import {
  adminTabHref,
  canOpenAdminTab,
  defaultAdminTabForRole,
  effectiveAdminTab,
  resolveAdminTab,
  type AdminTab,
} from '@/lib/adminHubTabs';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

const adminTabLoading = () => (
  <PageLoadingState variant="cards" title="جارٍ التحميل" description="نجهّز القسم…" />
);
const AdminExportButton = dynamic(() => import('@/components/admin/AdminExportButton').then((m) => m.AdminExportButton), { loading: adminTabLoading });
const AdminStatsGrid = dynamic(() => import('@/components/admin/AdminStatsGrid').then((m) => m.AdminStatsGrid), { loading: adminTabLoading });
const AdminRecentActivity = dynamic(() => import('@/components/admin/AdminRecentActivity').then((m) => m.AdminRecentActivity), { loading: adminTabLoading });
const AdminLatestActivity = dynamic(() => import('@/components/admin/AdminLatestActivity').then((m) => m.AdminLatestActivity), { loading: adminTabLoading });
const BroadcastNotificationButton = dynamic(() => import('@/components/admin/BroadcastNotificationButton').then((m) => m.BroadcastNotificationButton), { loading: adminTabLoading });
const AdminOpsQueue = dynamic(() => import('@/components/admin/AdminOpsQueue').then((m) => m.AdminOpsQueue), { loading: adminTabLoading });
const AdminPlatformTrends = dynamic(() => import('@/components/admin/AdminPlatformTrends').then((m) => m.AdminPlatformTrends), { loading: adminTabLoading });
const AdminAdsTable = dynamic(() => import('@/components/admin/AdminAdsTable').then((m) => m.AdminAdsTable), { loading: adminTabLoading });
const AdminUsersTable = dynamic(() => import('@/components/admin/AdminUsersTable').then((m) => m.AdminUsersTable), { loading: adminTabLoading });
const AdminSellersTable = dynamic(() => import('@/components/admin/AdminSellersTable').then((m) => m.AdminSellersTable), { loading: adminTabLoading });
const AdminStoresTable = dynamic(() => import('@/components/admin/AdminStoresTable').then((m) => m.AdminStoresTable), { loading: adminTabLoading });
const StoreTypesAdmin = dynamic(() => import('@/components/admin/StoreTypesAdmin').then((m) => m.StoreTypesAdmin), { loading: adminTabLoading });
const ServiceTypesAdmin = dynamic(() => import('@/components/admin/ServiceTypesAdmin').then((m) => m.ServiceTypesAdmin), { loading: adminTabLoading });
const AdminReportsTable = dynamic(() => import('@/components/admin/AdminReportsTable').then((m) => m.AdminReportsTable), { loading: adminTabLoading });
const AdminFraudTable = dynamic(() => import('@/components/admin/AdminFraudTable').then((m) => m.AdminFraudTable), { loading: adminTabLoading });
const AdminProductsTable = dynamic(() => import('@/components/admin/AdminProductsTable').then((m) => m.AdminProductsTable), { loading: adminTabLoading });
const AdminServiceListingsTable = dynamic(() => import('@/components/admin/AdminServiceListingsTable').then((m) => m.AdminServiceListingsTable), { loading: adminTabLoading });
const AdminOpenRequestsTable = dynamic(() => import('@/components/admin/AdminOpenRequestsTable').then((m) => m.AdminOpenRequestsTable), { loading: adminTabLoading });
const AdminServiceRequestDisputesTable = dynamic(() => import('@/components/admin/AdminServiceRequestDisputesTable').then((m) => m.AdminServiceRequestDisputesTable), { loading: adminTabLoading });
const AdminCategoryTypeTabs = dynamic(() => import('@/components/admin/AdminCategoryTypeTabs').then((m) => m.AdminCategoryTypeTabs), { loading: adminTabLoading });
const AdminCategoriesTree = dynamic(() => import('@/components/admin/AdminCategoriesTree').then((m) => m.AdminCategoriesTree), { loading: adminTabLoading });
const AdminProductCategoriesTree = dynamic(() => import('@/components/admin/AdminProductCategoriesTree').then((m) => m.AdminProductCategoriesTree), { loading: adminTabLoading });
const AdminServiceCategoriesTree = dynamic(() => import('@/components/admin/AdminServiceCategoriesTree').then((m) => m.AdminServiceCategoriesTree), { loading: adminTabLoading });
const CreateCategoryButton = dynamic(() => import('@/components/admin/CreateCategoryButton').then((m) => m.CreateCategoryButton), { loading: adminTabLoading });
const CreateProductCategoryButton = dynamic(() => import('@/components/admin/CreateProductCategoryButton').then((m) => m.CreateProductCategoryButton), { loading: adminTabLoading });
const CreateServiceCategoryButton = dynamic(() => import('@/components/admin/CreateServiceCategoryButton').then((m) => m.CreateServiceCategoryButton), { loading: adminTabLoading });
const AdminAuditLogsTable = dynamic(() => import('@/components/admin/AdminAuditLogsTable').then((m) => m.AdminAuditLogsTable), { loading: adminTabLoading });
const AdminMonitoringCenter = dynamic(() => import('@/components/admin/AdminMonitoringCenter').then((m) => m.AdminMonitoringCenter), { loading: adminTabLoading });
const AdminDeveloperToolsControl = dynamic(() => import('@/components/admin/AdminDeveloperToolsControl').then((m) => m.AdminDeveloperToolsControl), { loading: adminTabLoading });

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
        <AdminPageShell title="إدارة البائعين" description="البائعون، التقييمات، والحالة الحالية للحسابات.">
          <Suspense fallback={tableFallback}><AdminSellersTable /></Suspense>
        </AdminPageShell>
      );
    case 'stores':
      return (
        <AdminPageShell title="إدارة المتاجر" description="المتاجر والخطة والحالة.">
          <Suspense fallback={tableFallback}>
            <AdminStoresTable />
          </Suspense>
        </AdminPageShell>
      );
    case 'service-types':
      return (
        <AdminPageShell title="أنواع الخدمات" description="إدارة مجالات الخدمات والحقول الديناميكية والقدرات المسموحة.">
          <Suspense fallback={tableFallback}><ServiceTypesAdmin /></Suspense>
        </AdminPageShell>
      );
    case 'store-types':
      return (
        <AdminPageShell title="أنواع المتاجر" description="إدارة أنواع المتاجر، المصطلحات، والحدود الافتراضية.">
          <Suspense fallback={tableFallback}>
            <StoreTypesAdmin />
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
        <AdminPageShell title="مكافحة الاحتيال" description="مراجعة الحالات والإشارات التي تحتاج إلى تدخل.">
          <Suspense fallback={tableFallback}><AdminFraudTable /></Suspense>
        </AdminPageShell>
      );
    case 'products':
      return (
        <AdminPageShell title="المنتجات" description="مراجعة المحتوى وإدارته من مكان واحد.">
          <Suspense fallback={tableFallback}>
            <AdminProductsTable />
          </Suspense>
        </AdminPageShell>
      );
    case 'service-listings':
      return (
        <AdminPageShell title="عروض الخدمات" description="مراجعة المحتوى وإدارته من مكان واحد.">
          <Suspense fallback={tableFallback}>
            <AdminServiceListingsTable />
          </Suspense>
        </AdminPageShell>
      );
    case 'open-requests':
      return (
        <AdminPageShell title="الطلبات المفتوحة" description="طلبات الخدمة والمنتج والإيجار — مراجعة وإلغاء الطلبات عند الحاجة.">
          <Suspense fallback={tableFallback}><AdminOpenRequestsTable /></Suspense>
        </AdminPageShell>
      );
    case 'service-request-disputes':
      return (
        <AdminPageShell title="نزاعات الخدمات" description="مراجعة النزاعات المفتوحة وحسمها بإكمال الطلب أو إلغائه.">
          <Suspense fallback={tableFallback}><AdminServiceRequestDisputesTable /></Suspense>
        </AdminPageShell>
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
        <AdminPageShell title="سجل العمليات" description="تتبع الإجراءات الإدارية المهمة داخل المنصة.">
          <Suspense fallback={tableFallback}><AdminAuditLogsTable /></Suspense>
        </AdminPageShell>
      );
    case 'analytics':
      return (
        <div className="space-y-6">
          <h1 className="text-xl font-bold">التحليلات</h1>
          <AdminAnalyticsDashboard />
        </div>
      );
    case 'monitoring':
      return <AdminMonitoringCenter />;
    case 'dashboard':
    default:
      return (
        <AdminPageShell
          title="نظرة عامة"
          description="ملخص المنصة، الطوابير، وأحدث النشاط."
          actions={<BroadcastNotificationButton />}
        >
          <AdminDeveloperToolsControl />
          <AdminOpsQueue />
          <AdminPlatformTrends />
          <AdminStatsGrid />
          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <AdminRecentActivity />
            <AdminLatestActivity />
          </div>
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
