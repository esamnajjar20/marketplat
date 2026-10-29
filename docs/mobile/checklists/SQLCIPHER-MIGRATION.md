# Mobile — SQLCipher migration device tests

**Status:** must pass on a **native rebuild** (not Expo Go).  
**Config:** `expo-sqlite` plugin `useSQLCipher: true` in `app.json`  
**Code:** `apps/mobile/src/storage/encrypted-database.ts`

## Pre-conditions

- [ ] `npx expo prebuild` (or existing `android/` / `ios/`) includes SQLCipher  
- [ ] Install APK/IPA built with that native binary  
- [ ] Backup of any real legacy DB before testing  

## Cases

| # | Case | Expected | Pass? | Notes |
|---|------|----------|-------|-------|
| 1 | Fresh install, no legacy DB | Encrypted DB opens; `PRAGMA cipher_version` present | | |
| 2 | Legacy `marketplat-public-cache.db` present | Export to `marketplat-private-v2.db`; old file removed only after success | | |
| 3 | Kill app mid-migration | No silent empty DB; recoverable or safe failure | | |
| 4 | SecureStore key missing / wiped | Clear error path; no plaintext fallback on native | | |
| 5 | Web / unsupported | Explicit failure or documented non-encrypted path (no silent SQLCipher claim) | | |

## Commands / inspection

On device after open (via debug tools or temporary log in `__DEV__` only):

- Confirm cipher_version is non-empty  
- Confirm single encrypted DB name in use: `marketplat-private-v2.db`  

## Sign-off

Date: ________  Device: ________  Build: ________  Result: ________
