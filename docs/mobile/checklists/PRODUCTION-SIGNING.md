# Mobile Android — production signing

Gradle already supports production signing via environment variables (see `apps/mobile/android/app/build.gradle`).

## Required env vars (never commit)

```bash
export MARKETPLAT_RELEASE_STORE_FILE=/absolute/path/to/marketplat-release.jks
export MARKETPLAT_RELEASE_STORE_PASSWORD='***'
export MARKETPLAT_RELEASE_KEY_ALIAS='marketplat'
export MARKETPLAT_RELEASE_KEY_PASSWORD='***'
```

## Create keystore (once, offline)

```bash
keytool -genkeypair -v \
  -keystore marketplat-release.jks \
  -alias marketplat \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store the `.jks` in a secrets manager / encrypted CI secret, not in git.

## Verify before any store build

```bash
cd apps/mobile/android
./gradlew :app:verifyProductionSigning
./gradlew :app:assembleRelease   # or bundleRelease
```

If any `MARKETPLAT_RELEASE_*` var is missing, release falls back to **debug** signing (internal test only).

## CI (GitHub Actions)

1. Add repository secrets for the four values (store file as base64 secret decoded in the job).  
2. Before assemble/bundle, run `:app:verifyProductionSigning`.  
3. Fail the job if verify fails — do not publish debug-signed artifacts as production.

## Checklist

- [ ] Keystore created and backed up offline  
- [ ] Secrets in CI only  
- [ ] `verifyProductionSigning` green on CI  
- [ ] `versionCode` incremented per store upload  
- [ ] APK/AAB signature verified with `apksigner`  
