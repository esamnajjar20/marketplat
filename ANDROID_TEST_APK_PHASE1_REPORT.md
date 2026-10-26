# MarketPlat Android test APK — Phase 1

## Scope

Prepared against the uploaded `marketplat-main.zip` snapshot, not the live Codespaces filesystem. This phase adds explicit workspace commands and a static preflight for building a test APK. It does not create the APK.

## Findings from source review

- Expo/React Native native Android project exists at `apps/mobile/android`.
- Application ID: `com.marketplat.mobile`; Expo scheme: `marketplat`; app version: `0.1.0`.
- Gradle release variant currently uses `signingConfigs.debug`. It can be used for internal testing only, not public distribution.
- Gradle declares `versionCode 1` and `versionName "0.1.0"`.
- `EXPO_PUBLIC_API_URL` must point to a reachable API origin and is read by the app's JS client. The example URL is a placeholder.
- `AndroidManifest.xml` includes INTERNET, READ/WRITE_EXTERNAL_STORAGE, RECORD_AUDIO and SYSTEM_ALERT_WINDOW, among others. Confirm each permission is needed; avoid carrying broad permissions into a wider release without a feature justification. `android:allowBackup="true"` also needs a deliberate data-backup review.
- `README.md` explicitly states the mobile client is an early scaffold: several features are incomplete, and refresh-cookie behavior is not verified on devices.
- Native build is not verified by static checks; Android SDK/JDK availability, Gradle dependency resolution, actual APK generation, signature verification and device testing remain outstanding.

## Files changed

- `package.json`: adds `build:apk:test` and `verify:apk:test` workspace commands.
- `apps/mobile/package.json`: adds the Gradle test-APK task and static preflight command.
- `apps/mobile/scripts/verify-release-config.mjs`: checks app ID/version, Android Gradle release settings, manifest activity and optional APK artifact presence.
- `apps/mobile/README.md`: documents test-only signing, API environment setup, build commands, artifact path and device test requirements.

## Static validation performed on this patch

- JSON parse for both package manifests.
- Static verifier passes against the source snapshot.
- APK build/signature/device validation was not performed in this environment.

## Commands to run in Codespaces

```sh
pnpm verify:apk:test
pnpm --filter @marketplat/mobile type-check
pnpm --filter @marketplat/mobile test
pnpm build:apk:test
pnpm --filter @marketplat/mobile verify:apk:test -- --apk
```

If Gradle fails, capture the full output. If the APK builds, additionally run `apksigner verify --verbose` and install it on a physical device. Do not treat the build as release-ready until API flows and runtime behavior are tested.
