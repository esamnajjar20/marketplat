/**
 * navigation.ts — shared nav-item definitions used by more than one
 * navigation surface (UserMenu, ProtectedSidebar, ProtectedMobileNav,
 * MobileNav).
 *
 * NAV-DEDUP: before this file, BROWSE_LINKS / SETTINGS_GROUP /
 * SERVICES_GROUP / STORE_GROUP were each hand-duplicated across 2-3
 * layout files with byte-identical content. That's a real maintenance
 * hazard, not just repetition — the "عرض ملفي" link added across four
 * files in one pass (see git history) had to be added by hand to each
 * one individually, and it would have been trivially easy to miss one,
 * exactly the kind of gap this project's own audit passes keep finding
 * ("X had no link in nav Y"). Extracting the arrays that were already
 * 100% identical removes that failure mode for future additions to
 * these specific groups.
 *
 * Deliberately NOT included here: NAV_ITEMS (ProtectedSidebar) / LINKS
 * (ProtectedMobileNav) / AUTH_ACCOUNT_LINKS (MobileNav). These look
 * similar but are NOT the same list — different order, MobileNav's
 * version includes "أضف إعلانك" (which ProtectedMobileNav deliberately
 * omits, see its own doc comment on P3 FIX), and icons are optional in
 * some. Forcing those into one shared shape would need a superset with
 * per-surface filtering, adding indirection without removing any real
 * duplication. Each stays local to its file.
 */
import {
  Home, Search, Store, Wrench, Users, Settings,
  History, ListOrdered, Package,
} from 'lucide-react';
import { ROUTES } from '@/lib/constants';

// Used by MobileNav.tsx and ProtectedMobileNav.tsx (public-drawer and
// protected-drawer "تصفح" section respectively). Icons match the set
// both files already used before extraction (Store/Wrench, not the
// StoreIcon/WrenchIcon aliases ProtectedMobileNav had locally — same
// underlying icons, alias was only a naming collision workaround for
// components that also referenced HTML el names, not present here).
export const BROWSE_LINKS = [
  { label: 'الرئيسية', href: ROUTES.home, icon: Home },
  { label: 'البحث', href: ROUTES.search, icon: Search },
  // FIX NAV-ADS-01: كان رابط الإعلانات موجوداً في ExploreSheet فقط وغير
  // موجود في BROWSE_LINKS (القائمة الجانبية/الدرج) — فظهر للمستخدم أن
  // "القائمة الجانبية ما فيها خيار الإعلانات". نفس الوجهة المستخدمة في
  // ExploreSheet: /search?type=ads. المنتجات أيضاً أُضيفت للتناسق مع
  // ExploreSheet ووجود /products كصفحة تصفح مستقلة.
  { label: 'الإعلانات', href: `${ROUTES.search}?type=ads`, icon: ListOrdered },
  { label: 'المنتجات', href: ROUTES.products, icon: Package },
  { label: 'المتاجر', href: ROUTES.stores, icon: Store },
  { label: 'الخدمات', href: ROUTES.services, icon: Wrench },
  { label: 'مقدمو الخدمة', href: ROUTES.serviceProviders, icon: Users },
] as const;

// "نشاطي" group — secondary account destinations that were flat top-level
// links and lengthened the sidebar without matching the frequency of
// dashboard / messages / my-ads. Grouped so the primary three stay
// one-tap while these remain one disclosure away.
export const ACTIVITY_GROUP = {
  label: 'نشاطي',
  href: ROUTES.activity,
  icon: History,
  children: [
    { label: 'المفضلة', href: ROUTES.favorites },
    { label: 'عمليات البحث المحفوظة', href: ROUTES.savedSearches },
    { label: 'سجل النشاط', href: ROUTES.activity },
    { label: 'بلاغاتي', href: ROUTES.myReports },
  ],
} as const;

// Used by ProtectedSidebar.tsx and ProtectedMobileNav.tsx.
export const SERVICES_GROUP = {
  label: 'خدماتي',
  href: ROUTES.myServices,
  icon: Wrench,
  children: [
    { label: 'خدماتي', href: ROUTES.myServices },
    { label: 'الطلبات الواردة', href: ROUTES.incomingServiceRequests },
    { label: 'مواعيدي', href: ROUTES.myServiceAppointments },
    { label: 'طلباتي', href: ROUTES.myServiceRequests },
    { label: 'سوق الطلبات', href: ROUTES.serviceBroadcasts },
    { label: 'عروضي', href: ROUTES.myServiceBroadcastQuotes },
    { label: 'الإحصائيات', href: ROUTES.myServiceProviderAnalytics },
  ],
} as const;

// Used by ProtectedSidebar.tsx and ProtectedMobileNav.tsx.
export const STORE_GROUP = {
  label: 'متجري',
  href: ROUTES.myStore,
  icon: Store,
  children: [
    { label: 'لوحة المتجر', href: ROUTES.myStore },
    { label: 'منتجاتي', href: ROUTES.myStoreProducts },
    { label: 'العروض', href: ROUTES.myStorePromotions },
    { label: 'المجموعات', href: ROUTES.myStoreCollections },
    { label: 'الإحصائيات', href: ROUTES.myStoreAnalytics },
    { label: 'إعدادات المتجر', href: ROUTES.myStoreSettings },
    { label: 'المتاجر المتابَعة', href: ROUTES.myFollowedStores },
  ],
} as const;

// Used by ProtectedSidebar.tsx, ProtectedMobileNav.tsx, and
// MobileNav.tsx's SettingsDisclosureRow. Same 8 destinations, same
// order, in all three before extraction.
//
// AUDIT-FIX (nav duplication): the "متجري" child here (→ ROUTES.myStore)
// exists so a user with no store yet can reach the become-a-store-owner
// CTA on /my-store (StoreSettingsSection) from Settings — the only
// route in, since STORE_GROUP below is gated on isSeller and doesn't
// render for them at all. Once a user *is* a seller, though, STORE_GROUP
// renders as its own top-level disclosure with the exact same "متجري" →
// /my-store link, so this same destination then shows up twice in two
// unrelated sections of the same sidebar/drawer at once (confirmed
// duplicate, not just a similar-looking link — see settingsGroupFor's
// own doc for the fix). Kept in the base array (rather than deleted)
// since it's still the correct, only path for non-sellers; callers use
// settingsGroupFor(isSeller) below instead of this constant directly so
// the one genuinely redundant case is filtered without losing that path.
export const SETTINGS_GROUP = {
  label: 'الإعدادات',
  href: ROUTES.settings.profile,
  icon: Settings,
  children: [
    { label: 'الملف الشخصي', href: ROUTES.settings.profile },
    { label: 'ملف البائع', href: ROUTES.settings.seller },
    { label: 'ملف مقدم الخدمة', href: ROUTES.settings.serviceProvider },
    { label: 'إدارة المتجر', href: ROUTES.myStore },
    { label: 'الأمان', href: ROUTES.settings.security },
    { label: 'الجلسات', href: ROUTES.settings.sessions },
    { label: 'الإشعارات', href: ROUTES.settings.notifications },
    { label: 'المستخدمون المحظورون', href: ROUTES.settings.blockedUsers },
  ],
} as const;

export interface NavDisclosureGroup {
  label: string;
  href: string;
  icon: typeof Settings;
  children: readonly { label: string; href: string }[];
}

/**
 * AUDIT-FIX (nav duplication): returns SETTINGS_GROUP unchanged for
 * non-sellers (their only path to /my-store), or with the "متجري"
 * child dropped once isSeller is true — at that point STORE_GROUP is
 * already rendering the identical destination as its own top-level
 * disclosure right next to this one, so keeping it in both places is
 * pure duplication, not two meaningfully different entry points.
 * Every SETTINGS_GROUP renderer (ProtectedSidebar, MobileNav,
 * ProtectedMobileNav) already computes isSeller for STORE_GROUP's own
 * gate, so this needs no new data — just routes that existing value
 * through here too.
 */
export function settingsGroupFor(isSeller: boolean): NavDisclosureGroup {
  if (!isSeller) return SETTINGS_GROUP;
  return {
    ...SETTINGS_GROUP,
    children: SETTINGS_GROUP.children.filter((child) => child.href !== ROUTES.myStore),
  };
}
