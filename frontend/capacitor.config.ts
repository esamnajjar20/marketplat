import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — NEW (project had no Capacitor setup at all).
 *
 * `server.url` points the Android/iOS shell at the deployed frontend
 * (Railway/Vercel) rather than bundling a static export, per the chosen
 * "thin native shell around the existing hosted Next.js app" approach —
 * this is intentional: the backend requires a live API, Next.js's SSR
 * routes (middleware.ts auth checks, dynamic OG/manifest routes) don't
 * work from a `next export` static bundle, and it means shipping a
 * backend/frontend fix does not require a new app-store release.
 *
 * Set NEXT_PUBLIC_APP_URL (already read by lib/constants.ts's APP_URL)
 * to your deployed frontend origin before running `npx cap sync` —
 * this file reads it at Capacitor-CLI time (Node), so it must be set
 * in the shell environment, not just .env.local (Next.js only inlines
 * NEXT_PUBLIC_* into the browser bundle, not into this config file).
 *
 * For local device testing against a dev server on your machine, run
 * with e.g. `CAP_SERVER_URL=http://192.168.1.20:3000 npx cap sync`
 * (a real LAN IP — Android emulators/devices can't reach `localhost`
 * of the host machine).
 */
const devServerUrl = process.env.CAP_SERVER_URL;
const prodServerUrl = 'https://marketplat-production-a548.up.railway.app';

const config: CapacitorConfig = {
  appId: 'com.marketplat.app',
  appName: 'MarketPlat',
  // FIX: was 'public' — that's Next.js's own static-assets folder
  // (sw.js lives there) and has no index.html, which broke `npx cap
  // add android`'s copy step ("web assets directory must contain an
  // index.html"). webDir is required by the CLI schema and IS copied
  // into the native shell during `cap add`/`cap sync`, even though at
  // runtime the WebView never renders it — server.url below overrides
  // it immediately on launch. `www/` is a dedicated, empty-of-real-app
  // folder with just a placeholder index.html to satisfy the CLI; see
  // www/index.html's own comment.
  webDir: 'www',
  server: {
    url: devServerUrl || prodServerUrl || undefined,
    // Only relevant if the above resolves to an http:// URL (local dev
    // server). Never true against the production https:// origin.
    cleartext: Boolean(devServerUrl && devServerUrl.startsWith('http://')),
    // Lets deep links of the form https://<APP_URL host>/... open
    // directly inside the app instead of the system browser, once
    // Android App Links / iOS Universal Links are configured — see
    // README-CAPACITOR.md's "Deep links" section.
    androidScheme: 'https',
  },
  android: {
    // Standard Web Push (frontend/lib/pwa.ts) is unreliable for
    // background delivery inside an Android WebView — see
    // lib/capacitor/nativePush.ts's doc comment. This flag has no
    // effect on that; it only controls whether the WebView allows
    // mixed http content, kept false (secure default).
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 400,
      backgroundColor: '#FDFBF7', // matches app/manifest.ts's background_color
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    // Registration prompt is triggered manually from
    // lib/capacitor/nativePush.ts (after the user opts in via the
    // existing PushNotificationToggle UI) rather than automatically —
    // matches the existing web-push flow's opt-in-only pattern.
  },
};

export default config;
