# MarketPlat Mobile (React Native + Expo)

Native mobile client for MarketPlat. Separate from `apps/web`. Uses **Expo Router**, offline SQLite (SQLCipher on native), and authenticated API calls against the monorepo backend.

## Quick start

```sh
# from monorepo root
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
# set EXPO_PUBLIC_API_URL to API origin only (no /api/v1)
pnpm dev:mobile   # or: pnpm --filter @marketplat/mobile dev
```

- Android emulator → host machine: `http://10.0.2.2:<port>`
- Physical device → LAN IP or HTTPS endpoint
- Never commit real tokens in `.env`

## Scripts

| Script | Purpose |
|--------|---------|
| `dev` | Expo start |
| `android` / `ios` | Native run |
| `type-check` | `tsc --noEmit` |
| `test` | Maintained active static contract checks; 92 failed legacy contracts are explicitly quarantined in `scripts/quarantined-active.json` pending triage |
| `test:storage` | Node tests for durable-storage/outbox contracts |
| `test:sqlite` | Vitest storage integration/unit tests |
| `format` / `format:check` | Prettier على `app/` و`src/` (المرجع: `.prettierrc.json`) |
| `report:tokens` | تقرير غير حاجب: أرقام مباشرة للمسافات/الزوايا و`TextInput` الخام |
| `lint` | ESLint rules (raw hex colors and explicit `any`) plus supplemental source checks |
| `build:apk:test` | Internal test APK (may be debug-signed) |
| `verify:apk:test` | Static release-config checks |

## Known limitations (honest status)

These are **not** production-ready claims until the matching checklist is signed off under `docs/mobile/checklists/`. The latest source-archive verification after the mobile remediation pass has 70/70 active checks passing. A further 92 previously active checks are now explicitly quarantined pending review and rewrite because they fail against the current source contracts; they are not counted as passes and their behavior is not considered verified. Another 86 historical checks remain quarantined. The blocking runner reports all three groups separately; do not treat quarantine as proof of correctness.

| Area | Status | Checklist |
|------|--------|-----------|
| Android store signing | Env-based release config exists; default test builds use **debug** keystore | [PRODUCTION-SIGNING.md](../../docs/mobile/checklists/PRODUCTION-SIGNING.md) |
| Crash reporting | Sentry React Native SDK is integrated and initialized before the first React render; delivery and source-map symbolication require DSN/project secrets plus a release-build event test | [SENTRY-SETUP.md](../../docs/mobile/checklists/SENTRY-SETUP.md) |
| Session / refresh cookie | Designed for HttpOnly refresh + SecureStore access token; **device proof required** | [SESSION-DEVICE-VALIDATION.md](../../docs/mobile/checklists/SESSION-DEVICE-VALIDATION.md) |
| SQLCipher | Plugin + keyed opener; requires **native rebuild**, migration tested on real legacy DB | [SQLCIPHER-MIGRATION.md](../../docs/mobile/checklists/SQLCIPHER-MIGRATION.md) |
| Logout + outbox | Read failures now fail closed; unified façade is used by queue screens. Device scenarios still need sign-off | Session checklist §5 |
| Push | Android native FCM opt-in, token rotation, notification taps and deferred unregister are wired; requires matching Firebase config/service-account credentials and a dev/release build. iOS APNs is intentionally not wired to the FCM-only sender yet | [PUSH-NATIVE-SETUP.md](../../docs/mobile/checklists/PUSH-NATIVE-SETUP.md) |
| Links / iOS scope | HTTPS App Links and Universal Links configuration; iOS is Expo-managed, while native push remains Android-only pending APNs integration | [LINKING-IOS-STATUS-ROUND2-AR.md](../../docs/archive/mobile/docs/LINKING-IOS-STATUS-ROUND2-AR.md) |
| Native Google OAuth | Browser-based Google flow with one-time PKCE ticket exchange; callback/Google credentials and physical-device test remain required | [GOOGLE-NATIVE-OAUTH.md](../../docs/mobile/checklists/GOOGLE-NATIVE-OAUTH.md) |
| Dark mode | مدعوم: `ThemeProvider` (نظام / فاتح / داكن) + `userInterfaceStyle: automatic`؛ يلزم تحقق بصري على جهاز لكل الشاشات | `src/theme/ThemeProvider.tsx` |

## Architecture (short)

- `app/` — Expo Router screens  
- `src/features/` — domain modules (auth, ads, commerce, messaging, …)  
- `src/storage/` — encrypted DB, public/private cache, outboxes  
- `src/api/client.ts` — fetch, timeout, 401 refresh, allow-listed offline cache  
- `src/theme/tokens.ts` — design tokens (no raw hex in screens)
- `src/components/ui` — المدخل الوحيد للمكوّنات المشتركة (`MobileUI` مهمل)
- `src/lib/copy.ts` — نصوص واجهة مشتركة (إعادة المحاولة، إلخ)
- `plugins/with-forced-rtl.js` — يحافظ على فرض RTL الأصلي في Android حتى بعد `expo prebuild`
- `src/features/notifications/native-push.ts` — Android FCM lifecycle and explicit device opt-in
- `src/features/auth/google-oauth.native.ts` — native system-browser Google OAuth with PKCE
- Inbox uses `FlatList` virtualization with a memoized accessible conversation row. Messaging/notification read endpoints validate high-value JSON contracts through Zod before returning data.

Historical phase reports live in **`docs/history/`** (the living design guide is `DESIGN-SYSTEM-AR.md`). Duplicate root copies were removed after matching their SHA-256 hashes to the copies in `docs/history/`. After the 2026-11-08 remediation pass, the active static verifier suite is green (70/70); 92 active legacy contracts and 86 historical checks are quarantined and explicitly not represented as passing tests. Node storage/outbox tests pass 40/40. The Vitest include now discovers feature-level tests (including ads pagination and appointment slots), but Vitest, ESLint, Expo type-check and native builds still require the workspace dependencies and native SDK. The 92 quarantined contracts must be reviewed and rewritten as current behavioral tests before reactivation.

## Production Android notes

```sh
# required for store-bound builds
export MARKETPLAT_RELEASE_STORE_FILE=...
export MARKETPLAT_RELEASE_STORE_PASSWORD=...
export MARKETPLAT_RELEASE_KEY_ALIAS=...
export MARKETPLAT_RELEASE_KEY_PASSWORD=...
cd apps/mobile/android && ./gradlew :app:verifyProductionSigning :app:assembleRelease
```

See [PRODUCTION-SIGNING.md](../../docs/mobile/checklists/PRODUCTION-SIGNING.md).

## Docs index

- [docs/mobile/README.md](../../docs/mobile/README.md)  
- Archive of design/UX phase notes: [docs/mobile/archive/](../../docs/mobile/archive/)  
