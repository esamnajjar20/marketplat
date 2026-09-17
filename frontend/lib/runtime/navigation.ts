/**
 * سلوك الرجوع والروابط العميقة — Native فقط فعّال؛ الويب يعتمد على Next router.
 */

import { isNativePlatform } from '@/lib/capacitor/platform';
import { registerDeepLinkListener } from '@/lib/capacitor/deepLinks';

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
  void StatusBar.setStyle({ style: Style.Dark });
}
