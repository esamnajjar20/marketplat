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
    '/explore', '/ads', '/profile/', '/categories', '/products', '/stores', '/services', '/requests', '/search', '/service-types',
    '/stories', '/trending', '/suggestions', '/sellers-ranking', '/service-providers',
    '/promoted', '/product-categories', '/store-collections-public', '/for-you', '/following-feed',
  ] },
  { id: 'add', label: 'إضافة', path: '/add', glyph: 'add', matches: ['/add'] },
  { id: 'messages', label: 'الرسائل', path: '/messages', glyph: 'messages', matches: ['/messages'] },
  { id: 'account', label: 'حسابي', path: '/account', glyph: 'account', matches: [
    '/account', '/profile', '/my-', '/seller-dashboard', '/seller-profile', '/following', '/favorites', '/orders', '/settings', '/notifications', '/complete-profile', '/sessions', '/delete-account', '/saved-payments',
    '/activity', '/saved-searches', '/followed-stores', '/offline-queue', '/blocked-users',
    '/storage', '/seller-orders', '/customers', '/debts', '/installments', '/appointments',
    '/service-requests', '/service-provider-profile', '/service-provider-analytics',
    '/service-provider-hours', '/service-reviews', '/store-collections',
    '/store-hours', '/store-invites', '/store-promotions', '/store-team', '/store/', '/my-reports',
    '/my-offers', '/my-sales', '/my-products', '/my-services', '/my-requests', '/my-stores',
  ] },
];

export const DRAWER_ITEMS: ReadonlyArray<{
  label: string; path: string; icon: GlyphName; section: DrawerSection;
}> = [
  { label: 'الرئيسية', path: '/', icon: 'home', section: 'السوق' },
  { label: 'استكشف السوق', path: '/explore', icon: 'search', section: 'السوق' },
  { label: 'المتاجر', path: '/stores', icon: 'store', section: 'السوق' },
  { label: 'الخدمات', path: '/services', icon: 'service', section: 'السوق' },
  { label: 'إضافة إعلان أو منتج', path: '/add', icon: 'add', section: 'السوق' },
  { label: 'المحادثات', path: '/messages', icon: 'messages', section: 'السوق' },
  { label: 'المفضلة', path: '/favorites', icon: 'favorite', section: 'السوق' },
  { label: 'الإشعارات', path: '/notifications', icon: 'notification', section: 'حسابك' },
  { label: 'حسابي', path: '/account', icon: 'account', section: 'حسابك' },
  { label: 'ملفي الشخصي', path: '/profile', icon: 'account', section: 'حسابك' },
  { label: 'إعلاناتي', path: '/my-ads', icon: 'ads', section: 'حسابك' },
  { label: 'طلباتي', path: '/orders', icon: 'orders', section: 'حسابك' },
  { label: 'لوحة البائع', path: '/seller-dashboard', icon: 'store', section: 'حسابك' },
  { label: 'المتاجر التي أعمل بها', path: '/my-stores', icon: 'store', section: 'حسابك' },
  { label: 'طلبات الخدمات', path: '/service-requests', icon: 'service', section: 'حسابك' },
  { label: 'العمليات دون اتصال', path: '/offline-queue', icon: 'orders', section: 'حسابك' },
  { label: 'الإعدادات', path: '/settings', icon: 'settings', section: 'حسابك' },
  { label: 'اقتراحات المنتجات', path: '/suggestions', icon: 'help', section: 'السوق' },
];

const AUTH_ONLY_EXACT = new Set([
  '/add', '/messages', '/notifications', '/profile', '/following', '/following-feed', '/favorites',
  '/complete-profile', '/my-ads', '/my-products', '/my-services', '/my-stores',
  '/my-requests', '/my-offers', '/my-sales', '/my-reports', '/orders', '/seller-orders',
  '/appointments', '/blocked-users', '/customers', '/debts', '/installments',
  '/saved-searches', '/sessions', '/seller-dashboard', '/seller-profile',
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
