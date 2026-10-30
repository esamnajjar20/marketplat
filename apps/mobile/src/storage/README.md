# Mobile storage layer

## Layout

| Area | Role |
|------|------|
| `encrypted-database.ts` | SQLCipher-backed opener |
| `public-cache.ts` / `public-image-cache.ts` | Offline read cache |
| `mutation-outbox.ts` | Ad create/update/delete queue |
| `entity-create-outbox.ts` | Product/service/sale offline creates |
| `order-outbox.ts` | Marketplace orders |
| `chat-message-outbox.ts` / `chat-media-outbox.ts` | Chat offline send |
| `ad-draft-store.ts` / `persist-ad-image.ts` | Local drafts & images |
| **`outbox-manager.ts`** | **Façade for queue APIs, counts and snapshot** |
| `outbox-sync*.ts` / `Outbox*LifecycleBridge.tsx` | Background sync bridges |

## Source of truth vs `.mjs`

Some modules ship `.ts` + `.mjs` (+ `.d.ts` / `.d.mts`) so Node test scripts can import without a TypeScript loader.

- **Author in `.ts`.**
- Treat `.mjs` as a test mirror; keep behavior in sync when changing queue semantics.
- Do not import `.mjs` from the Expo app bundle.

## Guidance

- UI screens should import queue APIs from `outbox-manager` rather than directly from low-level queue modules. The façade exposes mutation, entity-create, order, chat message/media, request-create and request-offer queue APIs/types. Its snapshot includes all seven account-scoped queues and reports incomplete reads; destructive logout uses the stricter database-backed count in `public-cache.ts`.
- Workers / lifecycle bridges may use specific outbox modules for claim/ack/retry internals.
- Never convert a failed queue read into a zero pending count; surface the failed queue and block destructive logout when the count is unknown.
- Never run network I/O inside SQLite exclusive transactions.

### Pure queue helpers: source-of-truth rule

- `draft-operation-queue.mjs`, `outbox-sync-policy.mjs` and `outbox-transport-contract.mjs` are the single executable implementations of their dependency-free logic. Node's built-in test runner executes those exact files.
- `.d.mts` files exist only to give those `.mjs` modules TypeScript declarations. `outbox-sync-policy.ts` and `outbox-transport-contract.ts` are thin typed façades; they must not re-implement the logic. `draft-operation-queue.ts` was removed because no app import used it.
- When changing one of these helpers, update the canonical `.mjs` implementation and its Node tests first; do not create a parallel algorithm in TypeScript.
