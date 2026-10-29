# MarketPlat Mobile (React Native + Expo)

This is the first **scaffold** for a native mobile client. It is intentionally separate from `apps/web`; it does not replace or remove the Next.js website or the existing Capacitor Android project.

## Current scope

The mobile client has grown beyond the original starter scaffold. The repository currently includes Expo Router screens and feature modules for authentication, marketplace browsing and details, seller/store flows, sales and orders, requests/offers, messaging, media uploads, offline SQLite cache and mutation outboxes, and chat live-stream fallback behavior. Treat the source tree and automated tests as the source of truth for the exact implementation status of each feature; the original scaffold checklist below is intentionally not used as a current feature inventory.

Important limitations that still require device/server validation:

- **SQLite encryption:** Android/iOS config now requests SQLCipher and all native database access goes through a single keyed opener with a one-time legacy export path. This requires a rebuilt native binary (not Expo Go). Do not distribute until the migration is tested on a copy of a real legacy database and `PRAGMA cipher_version` is confirmed on device. Web storage is not SQLCipher-encrypted.
- **Logout with pending writes:** logout now checks durable queues and requires a clear choice before deleting unacknowledged operations. Returning to sync cancels logout; choosing deletion permanently discards those local queued writes.
- **Local file retention:** stale app-owned chat-media files are removed only after 24 hours and only if no queued operation references them. Draft/outbox-referenced ad images remain protected by the existing conservative cleanup.
- **Crash reporting is not production-ready yet:** the app still needs a native mobile crash-reporting SDK, a configured DSN, and a verified test event. Do not infer that the existing UI ErrorBoundary provides remote crash reporting.

- Refresh-cookie persistence and session restoration must be tested on physical Android and iOS devices against the deployed backend.
- Live SSE streaming depends on native `fetch` exposing a readable response body; when unsupported, the client must use its polling fallback.
- Offline writes can remain queued locally. Logging out clears account-scoped cached snapshots and queued private operations on this device; unsynchronized changes should be reviewed before logging out.
- The Android release signing configuration is for internal testing only and uses the debug signing key. Do not publish it to an app store.
- Production crash reporting and push-notification delivery must be treated as separate deployment capabilities and verified before claiming production support.

## Requirements

- Node.js version matching the repository root engines.
- pnpm version declared in the root `package.json`.
- Expo-compatible Android/iOS development environment as needed.

## Setup

From the repository root:

```sh
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
# Edit EXPO_PUBLIC_API_URL to point at the API origin (origin only, without `/api/v1`; the client adds `/api/v1/ads`).
pnpm dev:mobile
```

For Android emulator, `localhost` points to the emulator itself; use `10.0.2.2` for a development server running on the host machine, with the correct port. For a physical device, use a reachable LAN address or HTTPS endpoint. Never commit real credentials or tokens in `.env`.


## Test APK release (not a production-signed release)

This repository contains a native Android project under `apps/mobile/android`. The test-release task builds a standalone APK with the current Gradle `release` variant. **In the current configuration, that variant is signed with the Android debug keystore.** This is suitable only for internal/testing distribution; do not publish it to an app store or use it as a production release.

### Preflight

1. Install the root workspace dependencies with the repository's pinned pnpm version.
2. Ensure Java and Android SDK/SDK Build Tools are available in the build environment.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set `EXPO_PUBLIC_API_URL` to a reachable API origin. Do not commit `.env`. The API URL is compiled into the JS bundle at build time; changing it later requires rebuilding.
4. Review the Android permissions in `android/app/src/main/AndroidManifest.xml`; remove permissions not required by actual features before wider distribution.

### Build the test APK

From the repository root:

```sh
pnpm verify:apk:test
pnpm build:apk:test
```

The APK is expected at `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. Verify it exists and inspect its package/signature before installing. For example, with Android SDK Build Tools installed:

```sh
test -s apps/mobile/android/app/build/outputs/apk/release/app-release.apk
$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)/aapt dump badging apps/mobile/android/app/build/outputs/apk/release/app-release.apk | head -20
$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)/apksigner verify --verbose apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

These checks verify the artifact's presence and APK signature format; they do not prove runtime correctness. Install on a real Android device and test startup, API connectivity, login/logout, image selection, offline/error states, and session persistence. The mobile README currently documents several incomplete features and unverified refresh-cookie behavior, so this APK is a **test build**, not a feature-complete release.

### Signing warning

The Gradle `release` build type currently uses `signingConfigs.debug`. Do not replace the debug keystore with a committed production key. Before public release, configure a private release keystore through environment/CI secrets, increase `versionCode` for each distributable version, and verify backup/data handling and permissions.

### Static release-config check

`pnpm verify:apk:test` checks the app identifier/version and the expected test-signing/build settings. It does not compile Android code or create an APK.

## Validation status

The static scaffold/API-wiring check does not require network access. An Expo/Metro build, Android/iOS native build, and TypeScript check require the workspace dependencies to be installed and must be run in a connected development environment before treating this app as build-verified.

## Phase 8: password login (initial integration)

- The login screen uses the existing `POST /api/v1/auth/login` endpoint and validates the returned `data.user` and `data.tokens.accessToken` contract.
- The short-lived access token is kept in React memory only. The mobile app does not read, store, or expect a `refreshToken` in JSON; the backend intentionally keeps that token in an HttpOnly cookie.
- Logout calls the existing `POST /api/v1/auth/logout` endpoint with the Bearer access token and echoes the CSRF token when one was returned.
- This first iteration does **not** implement refresh-token cookie persistence or background session renewal. A process restart clears the in-memory login and the user may need to sign in again. This avoids inventing a mobile refresh-token contract or persisting sensitive tokens insecurely.
- `node scripts/verify-phase8.mjs` checks the static client/backend contract only. Live login, cookie behavior on Android/iOS, TypeScript, and native builds still need execution in an environment with dependencies and a configured API URL.

## Phase 9: secure access-token persistence and refresh attempt

- Added `expo-secure-store` for device-protected storage of the short-lived access token, user profile needed to restore the UI, CSRF value, and local expiry timestamp. The refresh token is never stored or read by the app.
- The app attempts `POST /api/v1/auth/refresh` on startup with `credentials: include`, relying on the backend's HttpOnly refresh cookie and existing rotation contract. The returned access token replaces the previous one when a cached user profile is available.
- A still-valid cached access token can remain available during temporary connectivity failure; expired or unusable cached sessions are cleared. Logout clears local secure storage even if the server request fails.
- Native cookie persistence and cross-origin credential behavior vary by platform and deployment CORS/cookie settings. This phase does **not** claim that Android/iOS refresh has been proven; test on both platforms against the deployed API. If native cookie persistence is not reliable, implement a deliberate mobile-specific backend session contract rather than exposing the refresh token to JavaScript.
- `node apps/mobile/scripts/verify-phase9.mjs` performs static contract checks only. TypeScript, live refresh rotation, and native builds still require dependency installation and an API environment.


## Phase 11: workspace readiness audit

- Added `scripts/verify-phase11.mjs` and wired it into the mobile test command. It checks workspace/package metadata, Expo app identifiers and routes, session restore/cleanup paths, and API timeout/cookie credential configuration.
- Updated this README to reflect the current authentication work rather than the earlier Phase 4 scaffold status.
- Environment validation attempted `corepack pnpm@10.18.0 install --lockfile-only --ignore-scripts`, but Corepack could not reach `registry.npmjs.org` (`EAI_AGAIN`). No lockfile was generated and no dependency installation was completed.
- Node.js `v22.16.0` is present, but pnpm itself is not installed in this environment. Therefore TypeScript, Expo Doctor/Metro, native builds, and real API/device tests remain unverified.


## Production Android signing

The existing `assembleRelease`/`bundleRelease` test workflows intentionally retain debug signing when no production signing environment is supplied. This is **not suitable for store publication**. Configure these environment variables from a private keystore and CI secrets:

- `MARKETPLAT_RELEASE_STORE_FILE` — path to the private `.jks`/`.keystore` file available to the build runner
- `MARKETPLAT_RELEASE_STORE_PASSWORD`
- `MARKETPLAT_RELEASE_KEY_ALIAS`
- `MARKETPLAT_RELEASE_KEY_PASSWORD`

Before any public release build, run `cd apps/mobile/android && ./gradlew :app:verifyProductionSigning` and then build the intended release artifact. Never commit the keystore or passwords. Increment `versionCode` for every published Android release.
