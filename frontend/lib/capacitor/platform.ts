/**
 * NEW — thin wrapper around @capacitor/core's platform detection.
 *
 * Every other file in lib/capacitor/ imports isNativePlatform() from
 * here instead of `Capacitor.isNativePlatform()` directly, and always
 * does so via a dynamic import (see below) rather than a static one.
 * Reason: this repo's frontend ships as a plain responsive website too
 * (Vercel/Railway, no Capacitor shell), and @capacitor/core must stay
 * an optional dependency for that build — a static top-level import
 * would pull it into every page's bundle even on the web. Dynamic
 * import means the ~3kb core package only loads inside an actual
 * Capacitor WebView.
 */
export async function isNativePlatform(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    // @capacitor/core not installed (plain web build) — not an error.
    return false;
  }
}

export async function getNativePlatformName(): Promise<'android' | 'ios' | 'web'> {
  if (typeof window === 'undefined') return 'web';
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.getPlatform() as 'android' | 'ios' | 'web';
  } catch {
    return 'web';
  }
}
