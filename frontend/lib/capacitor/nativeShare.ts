/**
 * NEW — native share sheet via @capacitor/share.
 *
 * ShareAdButton.tsx already calls navigator.share() as one dropdown
 * option (see that file). The Web Share API is *not* reliably present
 * inside an Android WebView the way it is in a real mobile browser —
 * this wrapper gives ShareAdButton a plugin-backed path that works
 * inside the Capacitor shell, falling back to navigator.share on plain
 * web. Returns false (not thrown) on user cancel, matching
 * ShareAdButton's existing silent-cancel handling.
 */
import { isNativePlatform } from './platform';

export interface NativeShareInput {
  title: string;
  url: string;
}

export async function nativeShare(input: NativeShareInput): Promise<boolean> {
  if (await isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    try {
      await Share.share({ title: input.title, url: input.url });
      return true;
    } catch {
      return false; // user dismissed the native share sheet
    }
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: input.title, url: input.url });
      return true;
    } catch {
      return false;
    }
  }

  return false; // caller falls back to copy-link
}

export async function canNativeShare(): Promise<boolean> {
  if (await isNativePlatform()) return true;
  return typeof navigator !== 'undefined' && !!navigator.share;
}
