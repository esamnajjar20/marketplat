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
  { label: 'المتاجر', href: ROUTES.stores, icon: Store },
  { label: 'الخدمات', href: ROUTES.services, icon: Wrench },
  { label: 'مقدمو الخدمة', href: ROUTES.serviceProviders, icon: Users },
] as const;

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
  ],
} as const;

// Used by ProtectedSidebar.tsx and ProtectedMobileNav.tsx.
export const STORE_GROUP = {
  label: 'متجري',
  href: ROUTES.myStore,
  icon: Store,
  children: [
    { label: 'متجري', href: ROUTES.myStore },
    { label: 'منتجاتي', href: ROUTES.myStoreProducts },
    { label: 'المتاجر المتابَعة', href: ROUTES.myFollowedStores },
  ],
} as const;

// Used by ProtectedSidebar.tsx, ProtectedMobileNav.tsx, and
// MobileNav.tsx's SettingsDisclosureRow. Same 8 destinations, same
// order, in all three before extraction.
export const SETTINGS_GROUP = {
  label: 'الإعدادات',
  href: ROUTES.settings.profile,
  icon: Settings,
  children: [
    { label: 'الملف الشخصي', href: ROUTES.settings.profile },
    { label: 'ملف البائع', href: ROUTES.settings.seller },
    { label: 'ملف مقدم الخدمة', href: ROUTES.settings.serviceProvider },
    { label: 'متجري', href: ROUTES.myStore },
    { label: 'الأمان', href: ROUTES.settings.security },
    { label: 'الجلسات', href: ROUTES.settings.sessions },
    { label: 'الإشعارات', href: ROUTES.settings.notifications },
    { label: 'المستخدمون المحظورون', href: ROUTES.settings.blockedUsers },
  ],
} as const;
