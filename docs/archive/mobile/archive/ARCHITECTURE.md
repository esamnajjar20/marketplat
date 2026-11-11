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
src/providers/          # QueryProvider, etc.
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
- Feature hooks (useHomeAds, useFavorites)
- useAsyncResource for simple screens
- Optional TanStack Query via QueryProvider

## Error handling
- ErrorBoundary in root layout
- error-reporting.ts → logger + optional Sentry

## Performance
- listPerformance (windowSize, getItemLayout)
- React.memo on AdCard / CatalogCard
- freezeOnBlur on Stack screens
