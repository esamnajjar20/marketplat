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
| **`outbox-manager.ts`** | **Façade for counts / snapshot (UI + logout)** |
| `outbox-sync*.ts` / `Outbox*LifecycleBridge.tsx` | Background sync bridges |

## Source of truth vs `.mjs`

Some modules ship `.ts` + `.mjs` (+ `.d.ts` / `.d.mts`) so Node test scripts can import without a TypeScript loader.

- **Author in `.ts`.**
- Treat `.mjs` as a test mirror; keep behavior in sync when changing queue semantics.
- Do not import `.mjs` from the Expo app bundle.

## Guidance

- Screens that only need “how many pending?” → `outbox-manager`.
- Workers / lifecycle bridges → specific outbox modules.
- Never run network I/O inside SQLite exclusive transactions.
