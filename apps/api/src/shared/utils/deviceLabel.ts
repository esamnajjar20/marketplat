import { createHash } from 'crypto';

/**
 * Device-list helpers (notification settings → "أجهزتي").
 *
 * The default label is a coarse "Browser · OS" string derived from the
 * User-Agent once, at first registration. Users can rename it afterwards;
 * re-registration never overwrites a stored label.
 */

const MAX_LABEL = 60;

function detectBrowser(ua: string): string {
  // Order matters: Edge/Opera/Samsung identify as Chrome, Chrome as Safari.
  if (/edg(e|a|ios)?\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/samsungbrowser/i.test(ua)) return 'Samsung Internet';
  if (/firefox|fxios/i.test(ua)) return 'Firefox';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'متصفح';
}

function detectOs(ua: string): string | null {
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/cros/i.test(ua)) return 'ChromeOS';
  if (/linux/i.test(ua)) return 'Linux';
  return null;
}

/** "Chrome · Android" — null when there is no usable User-Agent. */
export function labelFromUserAgent(userAgent: string | undefined | null): string | null {
  if (!userAgent || typeof userAgent !== 'string') return null;
  const ua = userAgent.slice(0, 512);
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  return (os ? `${browser} · ${os}` : browser).slice(0, MAX_LABEL);
}

/** Native-app default label from the registered platform. */
export function labelForNativePlatform(platform: string): string {
  if (platform === 'ios') return 'تطبيق iOS';
  if (platform === 'android') return 'تطبيق Android';
  return 'تطبيق الجوال';
}

/**
 * Stable, non-secret identifier for a registration. The raw push endpoint /
 * FCM token is a delivery credential, so the device list exposes only this
 * hash; the client hashes its own endpoint/token the same way to find
 * "this device" in the list.
 */
export function deviceFingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}
