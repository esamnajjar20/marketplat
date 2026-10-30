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
| `test` | Maintained static contract checks; historical failed checks are catalogued under `scripts/legacy-verifications/` |
| `test:storage` | Node tests for durable-storage/outbox contracts |
| `test:sqlite` | Vitest storage integration/unit tests |
| `lint` | ESLint rules (raw hex colors and explicit `any`) plus supplemental source checks |
| `build:apk:test` | Internal test APK (may be debug-signed) |
| `verify:apk:test` | Static release-config checks |

## Known limitations (honest status)

These are **not** production-ready claims until the matching checklist is signed off under `docs/mobile/checklists/`. The latest local static-verification run on 2026-10-30 had 60/60 active checks passing. An additional 86 historical checks remain quarantined and were not counted as passes; this does not mean the corresponding behavior has been proven correct. The blocking runner prints active and quarantined counts separately.

| Area | Status | Checklist |
|------|--------|-----------|
| Android store signing | Env-based release config exists; default test builds use **debug** keystore | [PRODUCTION-SIGNING.md](../../docs/mobile/checklists/PRODUCTION-SIGNING.md) |
| Crash reporting | Error boundary logs locally; native Sentry SDK/adapter is not installed, so DSN alone does not transmit events | [SENTRY-SETUP.md](../../docs/mobile/checklists/SENTRY-SETUP.md) |
| Session / refresh cookie | Designed for HttpOnly refresh + SecureStore access token; **device proof required** | [SESSION-DEVICE-VALIDATION.md](../../docs/mobile/checklists/SESSION-DEVICE-VALIDATION.md) |
| SQLCipher | Plugin + keyed opener; requires **native rebuild**, migration tested on real legacy DB | [SQLCIPHER-MIGRATION.md](../../docs/mobile/checklists/SQLCIPHER-MIGRATION.md) |
| Logout + outbox | Read failures now fail closed; unified façade is used by queue screens. Device scenarios still need sign-off | Session checklist §5 |
| Push / analytics | Not part of current mobile baseline | — |
| Dark mode | Light UI only (`userInterfaceStyle: light`) | — |

## Architecture (short)

- `app/` — Expo Router screens  
- `src/features/` — domain modules (auth, ads, commerce, messaging, …)  
- `src/storage/` — encrypted DB, public/private cache, outboxes  
- `src/api/client.ts` — fetch, timeout, 401 refresh, allow-listed offline cache  
- `src/theme/tokens.ts` — design tokens (no raw hex in screens)
- Inbox uses `FlatList` virtualization with a memoized accessible conversation row. Messaging/notification read endpoints validate high-value JSON contracts through Zod before returning data.

Historical phase reports live in **`../../docs/mobile/archive/`**, not in this folder. The duplicate root copies were removed after matching their SHA-256 hashes to the archived originals. After the 2026-10-30 refactor iterations, the active static verifier suite is green (60/60); 86 historical checks remain quarantined and are explicitly not represented as passing tests. Node storage/outbox tests pass 30/30. Full TypeScript, ESLint, and Vitest execution still require installing workspace dependencies.

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
