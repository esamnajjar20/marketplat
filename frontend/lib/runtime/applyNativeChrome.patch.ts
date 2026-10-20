/**
 * REPLACE the existing applyNativeChrome() in lib/runtime/navigation.ts
 * with this implementation (Phase 1).
 */
import { isNativePlatform } from '@/lib/capacitor/platform';

export async function applyNativeChrome(): Promise<void> {
  if (!(await isNativePlatform())) return;

  const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
  ]);

  void SplashScreen.hide();

  // Brand primary green — matches --primary / app bar
  void StatusBar.setBackgroundColor({ color: '#2F5D45' });
  void StatusBar.setStyle({ style: Style.Light });

  // Prefer non-overlay so content is not drawn under the status bar
  // (safe-area padding still applies via .pwa-safe-top).
  try {
    const StatusBarMod = await import('@capacitor/status-bar');
    if (typeof StatusBarMod.StatusBar.setOverlaysWebView === 'function') {
      void StatusBarMod.StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    /* older plugin — ignore */
  }
}
