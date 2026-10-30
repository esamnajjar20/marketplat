# Mobile — Sentry / crash reporting setup

The error-reporting boundary is wired to the root ErrorBoundary, but the native Sentry SDK is **not installed** in this repository yet. The current adapter intentionally avoids a static `require('@sentry/react-native')` so Metro does not fail resolving a missing package. A configured DSN alone does not send events; the app logs a warning and remains local-only until the SDK and native adapter are integrated.

## Install (from repo root, with workspace deps)

```bash
cd apps/mobile
npx expo install @sentry/react-native
# or from root with filter if configured:
# pnpm --filter @marketplat/mobile exec expo install @sentry/react-native
```

Update `apps/mobile/package.json` and `pnpm-lock.yaml` through pnpm, then commit both together. Do not hand-edit the SDK lock graph.

## Env

In `apps/mobile/.env` (never commit real DSN to public forks if sensitive):

```
EXPO_PUBLIC_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
```

`.env.example` should list the variable without a real value.

## Runtime

`initErrorReporting({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN })` runs once from root `_layout.tsx`; `ErrorBoundary` calls `captureException(error)`. Until the SDK adapter is registered, this produces local logs only, not a Sentry event.

## Verification

1. Build a **native** binary (not Expo Go if native modules required).  
2. Trigger a JS error (temporary button or bad navigation).  
3. Confirm event appears in Sentry project.  
4. Optionally trigger a native crash on a test build.  

## Checklist

- [ ] Install `@sentry/react-native` and resolve Expo SDK compatibility with `pnpm` (blocked in the current offline repair environment)  
- [ ] DSN in build env / EAS secrets  
- [ ] `initErrorReporting` called at startup  
- [ ] ErrorBoundary reports to Sentry  
- [ ] Test event received in Sentry UI  
- [ ] No DSN committed as a real production secret in public docs  
