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

/** Public discovery — used in mobile drawers (+ ExploreSheet mirrors this). */
export const BROWSE_LINKS = [
  { label: 'الرئيسية', href: ROUTES.home, icon: Home },
  { label: 'البحث', href: ROUTES.search, icon: Search },
  { label: 'الإعلانات', href: ROUTES.ads, icon: ListOrdered },
  { label: 'المنتجات', href: ROUTES.products, icon: Package },
  { label: 'الخدمات', href: ROUTES.services, icon: Wrench },
  { label: 'سوق الطلبات', href: ROUTES.requests, icon: ClipboardList },
  { label: 'المتاجر', href: ROUTES.stores, icon: Store },
  { label: 'مقدمو الخدمة', href: ROUTES.serviceProviders, icon: Users },
  { label: 'أفضل البائعين', href: ROUTES.sellersRanking, icon: Trophy },
] as const;

/** Secondary personal activity — not primary destinations. */
export const SALES_GROUP = {
  label: 'مبيعاتي',
  href: ROUTES.sales,
  icon: WalletCards,
  children: [],
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

  if (pathname === child.href) return true;

  // /requests is the market feed; do not mark it active on account sub-routes
  // (/requests/me, /offers, /new) which have their own nav children.
  if (child.href === ROUTES.requests) {
    if (
      pathname.startsWith('/requests/me') ||
      pathname.startsWith('/requests/offers') ||
      pathname.startsWith('/requests/new')
    ) {
      return false;
    }
    return pathname.startsWith('/requests/');
  }

  return pathname.startsWith(`${child.href}/`);
}
