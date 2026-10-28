/**
 * Merge into lib/runtime/navigation.ts — replace applyNativeChrome.
 * Theme-aware status bar (Phase 6).
 */

import { isNativePlatform } from '@/lib/capacitor/platform';

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export async function applyNativeChrome(): Promise<void> {
  if (!(await isNativePlatform())) return;

  const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
  ]);

  void SplashScreen.hide();

  const dark = isDarkTheme();
  // Brand green (light) / near-surface (dark)
  void StatusBar.setBackgroundColor({ color: dark ? '#1a1a1a' : '#2F5D45' });
  void StatusBar.setStyle({ style: dark ? Style.Light : Style.Light });
  // Light icons work on dark green; on near-black use Light too (white icons)

  try {
    if (typeof StatusBar.setOverlaysWebView === 'function') {
      void StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    /* ignore */
  }
}

/** Call when theme toggles while running inside the native shell. */
export async function syncNativeStatusBarTheme(): Promise<void> {
  if (!(await isNativePlatform())) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const dark = isDarkTheme();
    void StatusBar.setBackgroundColor({ color: dark ? '#1a1a1a' : '#2F5D45' });
    void StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* ignore */
  }
}
