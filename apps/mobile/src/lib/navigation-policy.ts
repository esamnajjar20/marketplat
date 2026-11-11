import type { GlyphName } from '@/components/Icons';

export type MainTabId = 'home' | 'explore' | 'add' | 'messages' | 'account';
export type DrawerSection = 'السوق' | 'حسابك' | 'المبيعات' | 'متجري' | 'خدماتي' | 'نشاطي' | 'الإعدادات' | 'المساعدة';
export type DrawerCapability = 'sellerWorkspace' | 'storeMembership' | 'serviceProvider';
export type NavigationCapabilities = Readonly<Record<DrawerCapability, boolean>>;

/** One canonical mapping from account API facts to navigation capabilities. */
export function resolveNavigationCapabilities(input: {
  hasSellerProfile: boolean;
  activeStoreMembershipCount: number;
  hasServiceProviderProfile: boolean;
}): NavigationCapabilities {
  const hasMembership = input.activeStoreMembershipCount > 0;
  return {
    sellerWorkspace: input.hasSellerProfile || hasMembership,
    storeMembership: hasMembership,
    serviceProvider: input.hasServiceProviderProfile,
  };
}

let navigationCapabilitiesRevision = 0;
const navigationCapabilitiesListeners = new Set<() => void>();

/** Notify open navigation surfaces that seller/provider capabilities changed. */
export function invalidateNavigationCapabilities(): void {
  navigationCapabilitiesRevision += 1;
  navigationCapabilitiesListeners.forEach((listener) => listener());
}

export function getNavigationCapabilitiesRevision(): number {
  return navigationCapabilitiesRevision;
}

export function subscribeNavigationCapabilities(listener: () => void): () => void {
  navigationCapabilitiesListeners.add(listener);
  return () => navigationCapabilitiesListeners.delete(listener);
}

export const MAIN_TABS: ReadonlyArray<{
  id: MainTabId;
  label: string;
  path: string;
  glyph: GlyphName;
  matches: readonly string[];
}> = [
  { id: 'home', label: 'الرئيسية', path: '/', glyph: 'home', matches: ['/'] },
  { id: 'explore', label: 'استكشف', path: '/explore', glyph: 'search', matches: [
    '/explore', '/ads', '/profile/', '/categories', '/products', '/stores', '/services', '/requests', '/search', '/service-types',
    '/stories', '/trending', '/suggestions', '/sellers-ranking', '/service-providers',
    '/promoted', '/product-categories', '/store-collections-public', '/for-you', '/following-feed',
  ] },
  { id: 'add', label: 'إضافة', path: '/add', glyph: 'add', matches: ['/add'] },
  { id: 'messages', label: 'الرسائل', path: '/messages', glyph: 'messages', matches: ['/messages'] },
  { id: 'account', label: 'حسابي', path: '/account', glyph: 'account', matches: [
    '/account', '/profile', '/my-', '/seller-dashboard', '/seller-profile', '/following', '/favorites', '/orders', '/settings', '/security', '/notifications', '/complete-profile', '/sessions', '/delete-account', '/saved-payments',
    '/activity', '/saved-searches', '/followed-stores', '/offline-queue', '/blocked-users',
    '/storage', '/seller-orders', '/customers', '/debts', '/installments', '/sales-costs', '/sales-insights', '/appointments',
    '/service-requests', '/service-provider-profile', '/service-provider-analytics',
    '/service-provider-hours', '/service-reviews', '/store-collections',
    '/store-hours', '/store-invites', '/store-promotions', '/store-team', '/store/', '/my-reports',
    '/my-offers', '/my-sales', '/my-products', '/my-services', '/my-requests', '/my-stores',
  ] },
];

export const DRAWER_ITEMS: ReadonlyArray<{
  label: string; path: string; icon: GlyphName; section: DrawerSection; capability?: DrawerCapability;
}> = [
  // السوق: وجهات التصفح الفعلية. الاستكشاف يبقى صفحة/تبويبًا مستقلًا ولا يتكرر هنا.
  { label: 'الرئيسية', path: '/', icon: 'home', section: 'السوق' },
  { label: 'البحث', path: '/search', icon: 'search', section: 'السوق' },
  { label: 'الإعلانات', path: '/ads', icon: 'ads', section: 'السوق' },
  { label: 'المنتجات', path: '/products', icon: 'product', section: 'السوق' },
  { label: 'الخدمات', path: '/services', icon: 'service', section: 'السوق' },
  { label: 'سوق الطلبات', path: '/requests', icon: 'orders', section: 'السوق' },
  { label: 'المتاجر', path: '/stores', icon: 'store', section: 'السوق' },
  { label: 'مقدمو الخدمة', path: '/service-providers', icon: 'service', section: 'السوق' },
  { label: 'أفضل البائعين', path: '/sellers-ranking', icon: 'account', section: 'السوق' },
  { label: 'الرائج الآن', path: '/trending', icon: 'star', section: 'السوق' },
  { label: 'مقترحات لك', path: '/suggestions', icon: 'help', section: 'السوق' },

  // الحساب والاتصال.
  { label: 'حسابي', path: '/account', icon: 'account', section: 'حسابك' },
  { label: 'ملفي الشخصي', path: '/profile', icon: 'account', section: 'حسابك' },
  { label: 'المحادثات', path: '/messages', icon: 'messages', section: 'حسابك' },
  { label: 'الإشعارات', path: '/notifications', icon: 'notification', section: 'حسابك' },
  { label: 'المفضلة', path: '/favorites', icon: 'favorite', section: 'حسابك' },
  { label: 'طلباتي الشرائية', path: '/orders', icon: 'orders', section: 'حسابك' },
  { label: 'المتابعة', path: '/following', icon: 'account', section: 'حسابك' },

  // مساحات العمل، ظاهرة فقط بعد تأكيد صلاحيات الحساب.
  { label: 'نظرة عامة', path: '/my-sales', icon: 'orders', section: 'المبيعات', capability: 'sellerWorkspace' },
  { label: 'العملاء', path: '/customers', icon: 'account', section: 'المبيعات', capability: 'sellerWorkspace' },
  { label: 'الديون', path: '/debts', icon: 'orders', section: 'المبيعات', capability: 'sellerWorkspace' },
  { label: 'الأقساط', path: '/installments', icon: 'orders', section: 'المبيعات', capability: 'sellerWorkspace' },
  { label: 'التحليلات والتقارير', path: '/sales-insights', icon: 'orders', section: 'المبيعات', capability: 'sellerWorkspace' },
  { label: 'التكلفة الحقيقية', path: '/sales-costs', icon: 'orders', section: 'المبيعات', capability: 'sellerWorkspace' },

  { label: 'ملف البائع', path: '/seller-profile', icon: 'account', section: 'متجري' },
  { label: 'لوحة المتجر', path: '/seller-dashboard', icon: 'store', section: 'متجري', capability: 'sellerWorkspace' },
  { label: 'منتجاتي', path: '/my-products', icon: 'product', section: 'متجري', capability: 'sellerWorkspace' },
  { label: 'مجموعات المتجر', path: '/store-collections', icon: 'store', section: 'متجري', capability: 'sellerWorkspace' },
  { label: 'العروض الترويجية', path: '/store-promotions', icon: 'ads', section: 'متجري', capability: 'sellerWorkspace' },
  { label: 'فريق المتجر', path: '/store-team', icon: 'account', section: 'متجري', capability: 'sellerWorkspace' },
  { label: 'إحصائيات المتجر', path: '/my-store-analytics', icon: 'orders', section: 'متجري', capability: 'sellerWorkspace' },
  { label: 'بيانات متجري', path: '/my-store', icon: 'store', section: 'متجري', capability: 'sellerWorkspace' },
  { label: 'المتاجر التي أديرها', path: '/my-stores', icon: 'store', section: 'متجري', capability: 'storeMembership' },

  { label: 'ملف مقدم الخدمة', path: '/service-provider-profile', icon: 'account', section: 'خدماتي' },
  { label: 'نظرة عامة', path: '/my-services', icon: 'service', section: 'خدماتي', capability: 'serviceProvider' },
  { label: 'الطلبات الواردة', path: '/service-requests', icon: 'orders', section: 'خدماتي', capability: 'serviceProvider' },
  { label: 'المواعيد', path: '/appointments', icon: 'orders', section: 'خدماتي', capability: 'serviceProvider' },
  { label: 'إحصائيات الخدمات', path: '/service-provider-analytics', icon: 'orders', section: 'خدماتي', capability: 'serviceProvider' },

  { label: 'النشاط', path: '/activity', icon: 'orders', section: 'نشاطي' },
  { label: 'إعلاناتي', path: '/my-ads', icon: 'ads', section: 'نشاطي' },
  { label: 'طلباتي', path: '/my-requests', icon: 'orders', section: 'نشاطي' },
  { label: 'بلاغاتي', path: '/my-reports', icon: 'help', section: 'نشاطي' },

  { label: 'الإعدادات', path: '/settings', icon: 'settings', section: 'الإعدادات' },
  { label: 'الأمان', path: '/security', icon: 'settings', section: 'الإعدادات' },
  { label: 'الجلسات', path: '/sessions', icon: 'account', section: 'الإعدادات' },
  { label: 'المستخدمون المحظورون', path: '/blocked-users', icon: 'account', section: 'الإعدادات' },
  { label: 'العمليات دون اتصال', path: '/offline-queue', icon: 'orders', section: 'المساعدة' },
];

const AUTH_ONLY_EXACT = new Set([
  '/add', '/messages', '/notifications', '/profile', '/following', '/following-feed', '/favorites',
  '/complete-profile', '/my-ads', '/my-products', '/my-services', '/my-stores',
  '/my-requests', '/my-offers', '/my-sales', '/my-reports', '/orders', '/seller-orders',
  '/appointments', '/blocked-users', '/customers', '/debts', '/installments', '/sales-costs', '/sales-insights',
  '/saved-searches', '/security', '/sessions', '/seller-dashboard', '/seller-profile',
  '/my-store-analytics', '/service-requests', '/offline-queue', '/saved-payments',
  '/followed-stores', '/storage', '/settings', '/activity', '/delete-account',
  '/service-provider-profile', '/service-provider-analytics', '/service-provider-hours',
  '/store-collections', '/store-hours', '/store-invites', '/store-promotions', '/store-team',
  '/order-checkout', '/order-confirmation', '/appointment-create', '/request-create',
  '/sale-create', '/story-create', '/ad-editor', '/product-editor', '/service-editor',
  '/service-images', '/report',
]);

const AUTH_ONLY_PREFIXES = [
  '/my-', '/store-team', '/store-invites', '/store-promotions', '/store-hours',
  '/store-collections', '/messages/', '/orders/', '/sales/', '/appointments/',
  '/service-requests/', '/report/',
];
const HIDDEN_TAB_PREFIXES = [
  '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/messages/',
  '/ads/', '/products/', '/stores/', '/services/', '/requests/', '/stories/', '/orders/',
  '/sales/', '/profile/', '/service-providers/', '/report/', '/collections/', '/categories/',
  '/ad-editor', '/product-editor', '/service-editor', '/sale-create', '/request-create',
  '/story-create', '/appointment-create', '/order-checkout', '/service-images', '/store/',
  '/service-requests/', '/appointments/', '/my-sales/', '/my-requests/', '/my-offers/',
];

export function routeMatches(pathname: string, root: string): boolean {
  const normalizedPath = normalizePathname(pathname);
  const normalizedRoot = normalizePathname(root);
  if (normalizedRoot === '/') return normalizedPath === '/';
  if (root.endsWith('/')) return normalizedPath.startsWith(root);
  if (root === '/my-') return normalizedPath.startsWith('/my-');
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function normalizePathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || '/';
  if (path === '/') return '/';
  return path.replace(/\/+$/, '') || '/';
}

export function getActiveMainTab(pathname: string): MainTabId | null {
  return MAIN_TABS.find((tab) => tab.matches.some((root) => routeMatches(pathname, root)))?.id ?? null;
}

export function shouldHideBottomNavigation(pathname: string): boolean {
  const normalizedPath = normalizePathname(pathname);
  return HIDDEN_TAB_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix));
}

export function requiresAuthenticatedUser(pathname: string): boolean {
  const normalizedPath = normalizePathname(pathname);
  if (AUTH_ONLY_EXACT.has(normalizedPath)) return true;
  if (AUTH_ONLY_PREFIXES.some((prefix) => routeMatches(normalizedPath, prefix))) return true;
  // The statistics view is a private store-management surface; public store pages remain public.
  return /^\/store\/[^/]+\/stats$/.test(normalizedPath);
}

export function getRouteAccess(pathname: string): 'public' | 'authenticated' {
  return requiresAuthenticatedUser(pathname) ? 'authenticated' : 'public';
}

/** Guests only see destinations they can open without an authentication redirect. */
export function getVisibleDrawerItems(
  isAuthenticated: boolean,
  capabilities?: NavigationCapabilities,
) {
  return DRAWER_ITEMS.filter((item) => {
    if (!isAuthenticated && getRouteAccess(item.path) !== 'public') return false;
    if (!isAuthenticated || !item.capability) return true;
    return capabilities?.[item.capability] === true;
  });
}
