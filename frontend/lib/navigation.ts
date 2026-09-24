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
export const ACTIVITY_GROUP = {
  label: 'نشاطي',
  href: ROUTES.activity,
  icon: History,
  children: [
    { label: 'المفضلة', href: ROUTES.favorites },
    { label: 'المحفوظات (دفع وبطاقات)', href: ROUTES.savedPayments },
    { label: 'التنزيلات', href: ROUTES.downloads },
    { label: 'إعلانات محفوظة دون نت', href: ROUTES.savedAds },
    { label: 'عمليات البحث المحفوظة', href: ROUTES.savedSearches },
    { label: 'سجل النشاط', href: ROUTES.activity },
    { label: 'بلاغاتي', href: ROUTES.myReports },
  ],
} as const;

/**
 * Open-requests account hub (authenticated).
 * - Desktop sidebar: includes "سوق الطلبات" (no separate browse section).
 * - Mobile: use requestsGroupFor(false) so browse section is not repeated.
 */
export const REQUESTS_GROUP = {
  label: 'طلباتي',
  href: ROUTES.myRequests,
  icon: ClipboardList,
  children: [
    { label: 'سوق الطلبات', href: ROUTES.requests },
    { label: 'طلباتي المنشورة', href: ROUTES.myRequests },
    { label: 'عروضي', href: ROUTES.myRequestOffers },
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
    { label: 'التخزين والبيانات', href: ROUTES.settings.storage },
    { label: 'المزامنة (عمليات دون اتصال)', href: ROUTES.settings.sync },
    // SW-FIX-OFFLINE-NAV: Warming Engine user controls —
    // sibling of sync (both belong to the offline surface).
    { label: 'العمل بدون إنترنت', href: ROUTES.settings.offline },
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

export function settingsGroupFor(isSeller: boolean): NavDisclosureGroup {
  if (!isSeller) return SETTINGS_GROUP as NavDisclosureGroup;
  return {
    ...SETTINGS_GROUP,
    children: SETTINGS_GROUP.children.filter((child) => child.href !== ROUTES.myStore),
  };
}

export function navChildIsActive(
  pathname: string,
  child: { href: string },
): boolean {
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
