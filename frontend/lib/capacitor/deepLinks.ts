/**
 * NEW — deep link routing for the Capacitor shell.
 *
 * Nothing in the repo handled `marketplat://...` or a native
 * "open this https://<app> link inside the app" flow before this —
 * the plan's item explicitly called this out as missing. On the web
 * build, Next.js's own router already handles every URL; this only
 * matters inside the installed Android/iOS app, where an external tap
 * (a WhatsApp-shared link, a push notification, the OS "Open with")
 * needs to be handed to Next's client-side router instead of
 * reloading the whole WebView.
 *
 * Two link shapes are supported, both resolving to the same in-app
 * path:
 *   marketplat://ads/123            (custom scheme, always available)
 *   https://<NEXT_PUBLIC_APP_URL host>/ads/123   (Android App Links /
 *                                     iOS Universal Links, once the
 *                                     platform-specific verification
 *                                     files below are in place)
 *
 * Android: requires an intent-filter in
 *   android/app/src/main/AndroidManifest.xml (added after you run
 *   `npx cap add android` — see README-CAPACITOR.md, the folder does
 *   not exist yet in this repo) and, for the https:// form specifically,
 *   an assetlinks.json served from the frontend's own domain — see
 *   README-CAPACITOR.md's "Android App Links" section for the exact
 *   file and route.
 * iOS: requires an apple-app-site-association file plus the
 *   Associated Domains capability in Xcode — also documented there.
 */
// FIX DEEPLINK-INTERNAL-IMPORT: كان يستورد نوع Next.js من مسار داخلي
// (next/dist/shared/...) — مسار خاص غير مُضمون عبر الإصدارات. التعريف
// المحلي (structural typing) يحقق نفس الغرض بلا اعتماد على مسار قد يختفي
// في Next.js 17+ (نفس نمط navigation.ts's RouterLike).
type RouterLike = {
  push: (href: string) => void;
};

import { isNativePlatform } from './platform';

function extractInAppPath(openedUrl: string): string | null {
  try {
    const url = new URL(openedUrl);
    if (url.protocol === 'marketplat:') {
      // Capacitor's appUrlOpen gives the full `marketplat://ads/123` —
      // for a custom scheme, the "host" segment IS the first path part.
      const rest = `${url.hostname}${url.pathname}${url.search}`.replace(/^\/+/, '');
      return `/${rest}`;
    }
    // https://... form (App Links / Universal Links) — just take the
    // path+query, same origin handling Next's own router would do.
    return `${url.pathname}${url.search}` || '/';
  } catch {
    return null;
  }
}

/**
 * Registers the appUrlOpen listener. Call once, on native platforms
 * only, from CapacitorBootstrap.tsx. No-op (returns a no-op cleanup)
 * on web.
 */
export async function registerDeepLinkListener(
  router: RouterLike
): Promise<() => void> {
  if (!(await isNativePlatform())) return () => {};

  const { App } = await import('@capacitor/app');

  const handle = await App.addListener('appUrlOpen', (event) => {
    const path = extractInAppPath(event.url);
    if (path) router.push(path);
  });

  return () => {
    void handle.remove();
  };
}
