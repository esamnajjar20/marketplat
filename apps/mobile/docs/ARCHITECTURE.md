# MarketPlat Mobile — Architecture

## Stack
- Expo SDK 58 + Expo Router (file-based)
- React Native 0.88 / React 19
- SQLite + SQLCipher (encrypted offline store)
- SecureStore for session + DB key

## Layers
```
app/                    # Routes (Expo Router screens)
src/components/ui/      # Design-system primitives
src/components/         # Composite UI (MarketCards, BottomNav)
src/features/*/         # Domain: api + hooks + screens logic
src/storage/            # Offline DB, outbox queues
src/storage/outbox/     # Shared lease outbox core
src/lib/                # routes, logger, navigation, validation
src/hooks/              # Cross-cutting hooks
src/providers/          # Shared runtime providers (only when actively wired)
src/theme/              # tokens + screenStyles
```

## Offline
- Mutation outbox (ads) with lease + idempotency
- Chat message / media outboxes
- Order outbox
- Favorites outbox
- Public GET cache for read-only feeds

## Auth
- session-storage.ts + private-data-cleanup.ts
- AuthContext wires refresh into api/client

## Navigation
- routes.ts single source of paths
- navigation.ts guards double-taps

## Data fetching
- `apiRequest` centralizes HTTP, access-token refresh, cancellation, Zod validation, and allow-listed offline cache.
- Feature modules still own their screen-specific loading, error, and pagination state.
- There is currently no project-wide server-state/query provider; `useAsyncResource` is a helper prototype, not a migrated screen contract.
- Do not assume TanStack Query is installed or wired. Preserve SQLCipher owner-scoped cache/outbox behavior during any future migration.

## Error handling
- ErrorBoundary in root layout
- `error-reporting.ts` logs locally and accepts an injected reporter adapter. No production Sentry/native reporter is installed yet; a DSN alone does not enable remote crash reporting.

## Performance
- listPerformance (windowSize, getItemLayout)
- React.memo on AdCard / CatalogCard
- freezeOnBlur on Stack screens
