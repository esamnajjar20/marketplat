/**
 * navigation.ts — shared nav definitions for ProtectedSidebar,
 * ProtectedMobileNav, MobileNav, ExploreSheet.
 *
 * IA principles:
 * 1. Browse/discovery links appear once (BROWSE_LINKS / ExploreSheet).
 * 2. Account hubs (طلبات، خدماتي، متجري) never repeat the same href
 *    already present in browse, except desktop sidebar which has no
 *    browse section — REQUESTS_GROUP therefore keeps one market link.
 * 3. Create actions live in CreateSheet (+), not duplicated in every group.
 * 4. settingsGroupFor(isSeller) drops "إدارة المتجر" when STORE_GROUP shows.
 */
import { DEFAULT_MY_STORE_TAB, resolveMyStoreTab } from '@/lib/myStoreHubTabs';
import { DEFAULT_MY_SERVICES_TAB, resolveMyServicesTab } from '@/lib/myServicesHubTabs';
import { DEFAULT_ACTIVITY_TAB, resolveActivityTab } from '@/lib/activityHubTabs';
import { DEFAULT_SETTINGS_TAB, resolveSettingsTab } from '@/lib/settingsHubTabs'; // SETTINGS-HUB-RESTORE-01
import { DEFAULT_SALES_HUB_TAB, resolveSalesHubTab } from '@/lib/salesHubTabs';
import {
  Home,
  Search,
  Store,
  Wrench,
  Users,
  Settings,
  History,
  ListOrdered,
  Package,
  Trophy,
  ClipboardList,
  WalletCards,
} from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { BROWSE_ROUTE_PATHS, isBrowseRouteActive } from '@/lib/browse-routes';

/** Public discovery links; href values come from the shared lightweight browse-route registry. */
const BROWSE_LINK_METADATA: Record<string, { label: string; icon: typeof Home }> = {
  [ROUTES.home]: { label: 'الرئيسية', icon: Home },
  [ROUTES.search]: { label: 'البحث', icon: Search },
  [ROUTES.ads]: { label: 'الإعلانات', icon: ListOrdered },
  [ROUTES.products]: { label: 'المنتجات', icon: Package },
  [ROUTES.services]: { label: 'الخدمات', icon: Wrench },
  [ROUTES.requests]: { label: 'سوق الطلبات', icon: ClipboardList },
  [ROUTES.stores]: { label: 'المتاجر', icon: Store },
  [ROUTES.serviceProviders]: { label: 'مقدمو الخدمة', icon: Users },
  [ROUTES.sellersRanking]: { label: 'أفضل البائعين', icon: Trophy },
} as const;

export const BROWSE_LINKS = BROWSE_ROUTE_PATHS.map((href) => ({
  href,
  ...BROWSE_LINK_METADATA[href],
}));

/** Secondary personal activity — not primary destinations. */
export const SALES_GROUP = {
  label: 'مبيعاتي',
  href: ROUTES.sales,
  icon: WalletCards,
  children: [
    { label: 'لوحة المبيعات', href: ROUTES.sales },
    { label: 'سجل المبيعات', href: ROUTES.salesSales },
    { label: 'العملاء', href: ROUTES.salesCustomers },
    { label: 'الديون', href: ROUTES.salesDebts },
    { label: 'الأقساط', href: ROUTES.salesInstallments },
    { label: 'الإحصائيات', href: ROUTES.salesAnalytics },
  ],
} as const;

export const ACTIVITY_GROUP = {
  label: 'نشاطي',
  href: ROUTES.activity,
  icon: History,
  children: [
    // ACTIVITY-HUB-01 tabs — إعلاناتي/طلباتي live as primary links elsewhere
    // (seller "إعلاناتي", REQUESTS_GROUP / SERVICES_GROUP) to avoid duplicates.
    { label: 'سجل النشاط', href: ROUTES.activity },
    { label: 'بلاغاتي', href: ROUTES.myReports },
    { label: 'المفضلة', href: ROUTES.favorites },
    { label: 'عمليات البحث المحفوظة', href: ROUTES.savedSearches },
  ],
} as const;

/**
 * Open-requests account hub (authenticated).
 * - Desktop sidebar: includes "سوق الطلبات" (no separate browse section).
 * - Mobile: use requestsGroupFor(false) so browse section is not repeated.
 */
export const REQUESTS_GROUP = {
  label: 'طلباتي',
  href: ROUTES.myOpenRequests,
  icon: ClipboardList,
  children: [
    { label: 'سوق الطلبات', href: ROUTES.requests },
    { label: 'طلباتي المنشورة', href: ROUTES.myOpenRequests },
    { label: 'عروضي', href: ROUTES.myOpenRequestOffers },
  ],
} as const;

/**
 * Provider workspace only — directed service requests, not the open market.
 * Open market lives in BROWSE_LINKS + REQUESTS_GROUP.
 */
export const SERVICES_GROUP = {
  label: 'خدماتي',
  href: ROUTES.myServices,
  icon: Wrench,
  children: [
    { label: 'لوحة الخدمات', href: ROUTES.myServices },
    { label: 'الطلبات الواردة', href: ROUTES.incomingServiceRequests },
    { label: 'مواعيدي', href: ROUTES.myServiceAppointments },
    { label: 'طلباتي لمزودين', href: ROUTES.myServiceRequests },
    { label: 'الإحصائيات', href: ROUTES.myServiceProviderAnalytics },
  ],
} as const;

export const STORE_GROUP = {
  label: 'متجري',
  href: ROUTES.myStore,
  icon: Store,
  children: [
    { label: 'لوحة المتجر', href: ROUTES.myStore },
    { label: 'منتجاتي', href: ROUTES.myStoreProducts },
    { label: 'المخزون', href: ROUTES.myStoreInventory },
    { label: 'الأعضاء', href: ROUTES.myStoreMembers },
    { label: 'العروض', href: ROUTES.myStorePromotions },
    { label: 'المجموعات', href: ROUTES.myStoreCollections },
    { label: 'الإحصائيات', href: ROUTES.myStoreAnalytics },
    { label: 'إعدادات المتجر', href: ROUTES.myStoreSettings },
    { label: 'المتاجر المتابَعة', href: ROUTES.myFollowedStores },
  ],
} as const;

export const SETTINGS_GROUP = {
  label: 'الإعدادات',
  href: ROUTES.settings.profile,
  icon: Settings,
  children: [
    { label: 'الملف الشخصي', href: ROUTES.settings.profile },
    { label: 'إدارة المتجر', href: ROUTES.myStore },
    { label: 'الأمان', href: ROUTES.settings.security },
    { label: 'الجلسات', href: ROUTES.settings.sessions },
    { label: 'الإشعارات', href: ROUTES.settings.notifications },
    { label: 'المستخدمون المحظورون', href: ROUTES.settings.blockedUsers },
    // OFFLINE-HUB-01: التخزين + المزامنة + العمل بدون إنترنت → مدخل واحد.
    { label: 'مركز الأوفلاين', href: ROUTES.offline.hub },
  ],
} as const;

export interface NavDisclosureGroup {
  label: string;
  href: string;
  icon: typeof Settings;
  children: readonly { label: string; href: string }[];
}

/** Drop "سوق الطلبات" when the surface already shows BROWSE_LINKS. */
export function requestsGroupFor(includeMarketLink: boolean): NavDisclosureGroup {
  if (includeMarketLink) return REQUESTS_GROUP as NavDisclosureGroup;
  return {
    ...REQUESTS_GROUP,
    children: REQUESTS_GROUP.children.filter((c) => c.href !== ROUTES.requests),
  };
}

export function settingsGroupFor(_isSeller: boolean): NavDisclosureGroup {
  // /my-store is a seller workspace, not a generic account setting.
  // Keep it only when the dedicated STORE_GROUP is present; non-sellers
  // get the explicit seller CTA elsewhere instead of a dead/unauthorized
  // "إدارة المتجر" link inside الإعدادات.
  return {
    ...SETTINGS_GROUP,
    children: SETTINGS_GROUP.children.filter((child) =>
      child.href !== ROUTES.myStore,
    ),
  };
}

export function navChildIsActive(
  pathname: string,
  child: { href: string },
  /** Current `location.search` (e.g. '?tab=products'). Only consulted for
   * /my-store and /my-services hub tabs, whose identity lives in the query
   * (MY-STORE-HUB-01, MY-SERVICES-HUB-01). */
  search = '',
): boolean {
  // MY-STORE-HUB-01: hub tabs share ONE pathname — compare the tab too.
  // '/my-store' (overview) is active only when no other tab is selected.
  const [childPath, childQuery = ''] = child.href.split('?');
  if (childPath === ROUTES.myStore) {
    if (pathname !== ROUTES.myStore) return false;
    const want = resolveMyStoreTab(childQuery ? `?${childQuery}` : '') ?? DEFAULT_MY_STORE_TAB;
    const have = resolveMyStoreTab(search) ?? DEFAULT_MY_STORE_TAB;
    return want === have;
  }

  // MY-SERVICES-HUB-01: same for the /my-services hub tabs.
  if (childPath === ROUTES.myServices) {
    if (pathname !== ROUTES.myServices) return false;
    const want = resolveMyServicesTab(childQuery ? `?${childQuery}` : '') ?? DEFAULT_MY_SERVICES_TAB;
    const have = resolveMyServicesTab(search) ?? DEFAULT_MY_SERVICES_TAB;
    return want === have;
  }


  // SALES-HUB-01: all sales workspace children share /account/sales.
  if (childPath === ROUTES.sales) {
    if (pathname !== ROUTES.sales) return false;
    const want = resolveSalesHubTab(childQuery ? `?${childQuery}` : '') ?? DEFAULT_SALES_HUB_TAB;
    const have = resolveSalesHubTab(search) ?? DEFAULT_SALES_HUB_TAB;
    return want === have;
  }

  // SETTINGS-HUB-01: all settings children share pathname /settings.
  // SETTINGS-HUB-RESTORE-01: restored after activity-hub-01.zip overwrote it.
  if (childPath === ROUTES.settings.root) {
    if (pathname !== ROUTES.settings.root) return false;
    const want = resolveSettingsTab(childQuery ? `?${childQuery}` : '') ?? DEFAULT_SETTINGS_TAB;
    const have = resolveSettingsTab(search) ?? DEFAULT_SETTINGS_TAB;
    return want === have;
  }

  // ACTIVITY-HUB-01: all activity children share pathname /activity.
  if (childPath === ROUTES.activity) {
    if (pathname !== ROUTES.activity) return false;
    const want = resolveActivityTab(childQuery ? `?${childQuery}` : '') ?? DEFAULT_ACTIVITY_TAB;
    const have = resolveActivityTab(search) ?? DEFAULT_ACTIVITY_TAB;
    return want === have;
  }

  // Keep browse-link state aligned with BottomNav and ExploreSheet, while
  // excluding private creation/account routes from their public sections.
  if ((BROWSE_ROUTE_PATHS as readonly string[]).includes(childPath)) {
    return isBrowseRouteActive(pathname, childPath);
  }

  if (pathname === child.href) return true;

  return pathname.startsWith(`${child.href}/`);
}

// ──────────────────────────────────────────────────────────────
// Safe back navigation — appended separately (do not overwrite
// the navigation data above).
// ──────────────────────────────────────────────────────────────
export interface BackCapableRouter {
  back: () => void;
  push: (href: string) => void;
}

export function safeBack(
  router: BackCapableRouter,
  fallback = "/",
  onFallback?: (href: string) => void,
): void {
  if (typeof window === "undefined") {
    router.push(fallback);
    return;
  }
  const ref = document.referrer;
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(ref) && new URL(ref).origin === window.location.origin;
  } catch {
    sameOrigin = false;
  }
  if (sameOrigin && window.history.length > 1) {
    router.back();
  } else {
    onFallback?.(fallback);
    router.push(fallback);
  }
}
