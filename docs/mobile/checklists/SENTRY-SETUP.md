# Mobile — Sentry / crash reporting setup

Scaffold already exists: `apps/mobile/src/lib/error-reporting.ts`  
Wire-up in root layout is part of Phase 1 code patch.

## Install (from repo root, with workspace deps)

```bash
cd apps/mobile
npx expo install @sentry/react-native
# or from root with filter if configured:
# pnpm --filter @marketplat/mobile exec expo install @sentry/react-native
```

Update lockfile and commit.

## Env

In `apps/mobile/.env` (never commit real DSN to public forks if sensitive):

```
EXPO_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
```

`.env.example` should list the variable without a real value.

## Runtime

`initErrorReporting({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN })` runs once from root `_layout.tsx`.  
`ErrorBoundary` should call `captureException(error)`.

## Verification

1. Build a **native** binary (not Expo Go if native modules required).  
2. Trigger a JS error (temporary button or bad navigation).  
3. Confirm event appears in Sentry project.  
4. Optionally trigger a native crash on a test build.  

## Checklist

- [ ] `@sentry/react-native` in package.json + lockfile  
- [ ] DSN in build env / EAS secrets  
- [ ] `initErrorReporting` called at startup  
- [ ] ErrorBoundary reports to Sentry  
- [ ] Test event received in Sentry UI  
- [ ] No DSN committed as a real production secret in public docs  
