/**
 * NEW — native GPS access via @capacitor/geolocation.
 *
 * The web build already resolves coordinates through the browser's
 * navigator.geolocation API (hooks/useSilentCoordinates.ts,
 * hooks/useLocationResolver.ts). Those are left untouched here — both
 * have their own test coverage and navigator.geolocation actually
 * works fine inside a Capacitor WebView on Android/iOS in most cases.
 * What the plugin adds is the native OS permission-request UX (a real
 * system dialog instead of the browser chrome prompt) and reliable
 * behavior on iOS WKWebView, where navigator.geolocation support has
 * historically been inconsistent. This is an additive alternative,
 * not a replacement — see README-CAPACITOR.md for wiring it into
 * useSilentCoordinates.ts if native permission UX turns out to matter
 * in practice.
 */
import { isNativePlatform } from './platform';

export interface NativeCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Returns coordinates via the native plugin. Returns null on web
 * (caller should fall back to navigator.geolocation) or if permission
 * is denied.
 */
export async function getNativeCoordinates(): Promise<NativeCoordinates | null> {
  if (!(await isNativePlatform())) return null;

  const { Geolocation } = await import('@capacitor/geolocation');

  const permission = await Geolocation.checkPermissions();
  if (permission.location !== 'granted') {
    const requested = await Geolocation.requestPermissions();
    if (requested.location !== 'granted') return null;
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10_000,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
}
