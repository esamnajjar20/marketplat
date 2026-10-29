import { router, type Href } from 'expo-router';
import { routes, TAB_ROUTES } from '@/lib/routes';

/**
 * مساعدات تنقل سلس:
 * - منع النقر المزدوج السريع
 * - تمييز تبويب / تفاصيل / استبدال
 */

let lastNavAt = 0;
const GUARD_MS = 380;

function allowNav(): boolean {
  const now = Date.now();
  if (now - lastNavAt < GUARD_MS) return false;
  lastNavAt = now;
  return true;
}

/** تنقل تبويب رئيسي (بدون تكديس نفس المسار) */
export function goTab(path: Href | string): void {
  if (!allowNav()) return;
  router.navigate(path as Href);
}

/** فتح شاشة تفصيل / مسار فرعي (يدفع للمكدس) */
export function openScreen(path: Href | string): void {
  if (!allowNav()) return;
  router.push(path as Href);
}

/** استبدال الشاشة الحالية (بعد دخول ناجح مثلاً) */
export function replaceScreen(path: Href | string): void {
  if (!allowNav()) return;
  router.replace(path as Href);
}

/** رجوع آمن */
export function goBack(fallback: Href | string = routes.tabs.home): void {
  if (!allowNav()) return;
  if (router.canGoBack()) router.back();
  else router.replace(fallback as Href);
}

/** مسارات التبويبات الرئيسية — للتنقل بدون animation stacking مفرط */
export const TAB_PATHS = new Set<string>(TAB_ROUTES);

export function isTabPath(path: string): boolean {
  return TAB_PATHS.has(path);
}

/** اختصارات شائعة */
export const nav = {
  home: () => goTab(routes.tabs.home),
  explore: () => goTab(routes.tabs.explore),
  messages: () => goTab(routes.tabs.messages),
  account: () => goTab(routes.tabs.account),
  login: () => openScreen(routes.auth.login),
  adDetail: (id: string) => openScreen(routes.ads.detail(id)),
  thread: (id: string) => openScreen(routes.messages.thread(id)),
} as const;
