/**
 * سلوك الرجوع والروابط العميقة — Native فقط فعّال؛ الويب يعتمد على Next router.
 */

import { isNativePlatform } from '@/lib/capacitor/platform';
import { registerDeepLinkListener } from '@/lib/capacitor/deepLinks';
import { APP_URL } from '@/lib/constants';


/**
 * Normalize a notification destination to a same-origin in-app route.
 * Reject protocol-relative URLs, backslashes, control characters, and
 * absolute URLs whose origin differs from the configured application.
 */
export function normalizeNativeNavigationTarget(raw: string): string | null {
  const candidate = raw.trim();
  if (!candidate || /[\\\u0000-\u001f\u007f]/.test(candidate)) return null;
  if (candidate.startsWith('//') || candidate.startsWith('\\\\')) return null;

  try {
    const appOrigin = new URL(APP_URL).origin;
    const parsed = new URL(candidate, APP_URL);
    if (parsed.protocol !== 'https:' || parsed.origin !== appOrigin) return null;
    if (!candidate.startsWith('/') && parsed.origin === appOrigin) {
      // Absolute links are accepted only when they point to our exact origin.
      if (!/^https:\/\//i.test(candidate)) return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return null;
  }
}

type RouterLike = {
  back: () => void;
  push: (href: string) => void;
};

/**
 * زر الرجوع في Android: يرجع داخل التطبيق، وإلا يصغّر التطبيق
 * بدل إغلاقه فورًا.
 */
export async function registerNativeBackButton(
  router: RouterLike,
): Promise<() => void> {
  if (!(await isNativePlatform())) return () => {};

  const { App } = await import('@capacitor/app');
  const listener = await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      router.back();
    } else {
      void App.minimizeApp();
    }
  });
  return () => {
    void listener.remove();
  };
}

export async function registerNativeDeepLinks(
  router: RouterLike,
): Promise<() => void> {
  if (!(await isNativePlatform())) return () => {};
  // deepLinks expects Next router; structural typing is enough
  return registerDeepLinkListener(router as Parameters<typeof registerDeepLinkListener>[0]);
}

/** تهيئة شريط الحالة + إخفاء شاشة البداية بعد الرسم. */
export async function applyNativeChrome(): Promise<void> {
  if (!(await isNativePlatform())) return;
  const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
  ]);
  void SplashScreen.hide();
  void StatusBar.setBackgroundColor({ color: '#2F5D45' });
  // The app bar is dark green, so request light (white) status-bar icons/text.
  void StatusBar.setStyle({ style: Style.Light });
}
