/**
 * NEW — native-shell bootstrap, sibling to PwaBootstrap (which stays
 * untouched and keeps owning all Service-Worker/web-PWA concerns).
 * Everything in here is a no-op on the plain web build — isNativePlatform()
 * short-circuits every import before any @capacitor/* package loads.
 *
 * Handles, all previously entirely absent from the project:
 *  - deep links (marketplat://... and https://... open-in-app)
 *  - hiding the native splash screen once the WebView has painted
 *  - status bar styling matching the app's theme color
 *  - Android hardware back button (WebView has no back button of its
 *    own; without this, the OS default is to exit the app on every
 *    back-press instead of navigating within it)
 */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativePlatform } from '@/lib/capacitor/platform';
import { registerDeepLinkListener } from '@/lib/capacitor/deepLinks';

export function CapacitorBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let cleanupDeepLinks: (() => void) | undefined;
    let cleanupBackButton: (() => void) | undefined;

    void (async () => {
      if (!(await isNativePlatform())) return;

      cleanupDeepLinks = await registerDeepLinkListener(router);

      const [{ SplashScreen }, { StatusBar, Style }, { App }] = await Promise.all([
        import('@capacitor/splash-screen'),
        import('@capacitor/status-bar'),
        import('@capacitor/app'),
      ]);

      void SplashScreen.hide();
      // Matches app/manifest.ts's theme_color (#2F5D45, a dark green) —
      // Style.Dark here means "light text/icons for a dark bar", not
      // "dark mode".
      void StatusBar.setBackgroundColor({ color: '#2F5D45' });
      void StatusBar.setStyle({ style: Style.Dark });

      const backListener = await App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          router.back();
        } else {
          void App.minimizeApp();
        }
      });
      cleanupBackButton = () => void backListener.remove();
    })();

    return () => {
      cleanupDeepLinks?.();
      cleanupBackButton?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router identity is stable from next/navigation
  }, []);

  return null;
}
