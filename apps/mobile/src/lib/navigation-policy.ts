import type { GlyphName } from '@/components/Icons';

export type MainTabId = 'home' | 'explore' | 'add' | 'messages' | 'account';
export type DrawerSection = 'السوق' | 'حسابك' | 'المساعدة';

export const MAIN_TABS: ReadonlyArray<{
  id: MainTabId;
  label: string;
  path: string;
  glyph: GlyphName;
  matches: readonly string[];
}> = [
  { id: 'home', label: 'الرئيسية', path: '/', glyph: 'home', matches: ['/'] },
  { id: 'explore', label: 'استكشف', path: '/explore', glyph: 'search', matches: [
    '/explore', '/profile/', '/categories', '/products', '/stores', '/services', '/requests', '/search',
    '/stories', '/trending', '/suggestions', '/sellers-ranking', '/service-providers',
    '/promoted', '/product-categories', '/store-collections-public', '/for-you', '/following-feed',
  ] },
  { id: 'add', label: 'إضافة', path: '/add', glyph: 'add', matches: ['/add'] },
  { id: 'messages', label: 'الرسائل', path: '/messages', glyph: 'messages', matches: ['/messages'] },
  { id: 'account', label: 'حسابي', path: '/account', glyph: 'account', matches: [
    '/account', '/my-', '/favorites', '/orders', '/settings', '/notifications',
    '/activity', '/saved-searches', '/followed-stores', '/offline-queue', '/blocked-users',
    '/storage', '/seller-orders', '/customers', '/debts', '/installments', '/appointments',
    '/service-requests', '/service-provider-profile', '/service-provider-analytics',
    '/seller-profile', '/service-provider-hours', '/service-reviews', '/store-collections',
    '/store-hours', '/store-invites', '/store-promotions', '/store-team', '/my-reports',
    '/my-offers', '/my-sales', '/my-products', '/my-services', '/my-requests', '/my-stores',
  ] },
];

export const DRAWER_ITEMS: ReadonlyArray<{
  label: string; path: string; icon: GlyphName; section: DrawerSection; requiresAuth?: boolean;
}> = [
  { label: 'الرئيسية', path: '/', icon: 'home', section: 'السوق' },
  { label: 'استكشف السوق', path: '/explore', icon: 'search', section: 'السوق' },
  { label: 'المتاجر', path: '/stores', icon: 'store', section: 'السوق' },
  { label: 'الخدمات', path: '/services', icon: 'service', section: 'السوق' },
  { label: 'إضافة إعلان أو منتج', path: '/add', icon: 'add', section: 'السوق', requiresAuth: true },
  { label: 'المحادثات', path: '/messages', icon: 'messages', section: 'السوق', requiresAuth: true },
  { label: 'المفضلة', path: '/favorites', icon: 'favorite', section: 'السوق' },
  { label: 'الإشعارات', path: '/notifications', icon: 'notification', section: 'حسابك', requiresAuth: true },
  { label: 'حسابي', path: '/account', icon: 'account', section: 'حسابك' },
  { label: 'ملفي الشخصي', path: '/profile', icon: 'account', section: 'حسابك', requiresAuth: true },
  { label: 'إعلاناتي', path: '/my-ads', icon: 'ads', section: 'حسابك', requiresAuth: true },
  { label: 'طلباتي', path: '/orders', icon: 'orders', section: 'حسابك', requiresAuth: true },
  { label: 'لوحة البائع', path: '/seller-dashboard', icon: 'store', section: 'حسابك', requiresAuth: true },
  { label: 'المتاجر التي أعمل بها', path: '/my-stores', icon: 'store', section: 'حسابك', requiresAuth: true },
  { label: 'طلبات الخدمات', path: '/service-requests', icon: 'service', section: 'حسابك', requiresAuth: true },
  { label: 'العمليات دون اتصال', path: '/offline-queue', icon: 'orders', section: 'حسابك', requiresAuth: true },
  { label: 'الإعدادات', path: '/settings', icon: 'settings', section: 'حسابك', requiresAuth: true },
  { label: 'اقتراحات المنتجات', path: '/suggestions', icon: 'help', section: 'السوق' },
];

const AUTH_ONLY_EXACT = new Set([
  '/notifications', '/profile', '/my-ads', '/my-products', '/my-services', '/my-stores',
  '/my-requests', '/my-offers', '/my-sales', '/my-reports', '/orders', '/seller-orders',
  '/seller-dashboard', '/my-store-analytics', '/customers', '/debts', '/installments', '/appointments',
  '/service-requests', '/offline-queue', '/saved-payments', '/saved-searches', '/followed-stores',
  '/blocked-users', '/storage', '/settings', '/activity', '/sessions', '/delete-account',
]);

const AUTH_ONLY_PREFIXES = ['/my-store', '/store-team', '/store-invites', '/store-promotions', '/store-hours'];
const HIDDEN_TAB_PREFIXES = [
  '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/messages/',
  '/ads/', '/products/', '/stores/', '/services/', '/requests/', '/stories/', '/orders/',
  '/sales/', '/profile/', '/service-providers/', '/report/', '/collections/', '/categories/',
  '/ad-editor', '/product-editor', '/service-editor', '/sale-create', '/request-create',
  '/story-create', '/appointment-create', '/order-checkout', '/service-images', '/store/',
  '/service-requests/', '/appointments/', '/my-sales/', '/my-requests/', '/my-offers/',
];

export function routeMatches(pathname: string, root: string): boolean {
  if (root === '/') return pathname === '/';
  if (root.endsWith('/')) return pathname.startsWith(root);
  if (root === '/my-') return pathname.startsWith('/my-');
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function getActiveMainTab(pathname: string): MainTabId | null {
  return MAIN_TABS.find((tab) => tab.matches.some((root) => routeMatches(pathname, root)))?.id ?? null;
}

export function shouldHideBottomNavigation(pathname: string): boolean {
  return HIDDEN_TAB_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function requiresAuthenticatedUser(pathname: string): boolean {
  return AUTH_ONLY_EXACT.has(pathname) || AUTH_ONLY_PREFIXES.some((prefix) => routeMatches(pathname, prefix));
}

export function getRouteAccess(pathname: string): 'public' | 'authenticated' {
  return requiresAuthenticatedUser(pathname) ? 'authenticated' : 'public';
}
