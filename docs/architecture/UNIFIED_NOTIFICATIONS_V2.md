# Unified Notifications V2

## Canonical contract

`packages/contracts/src/notifications.ts` is the shared runtime and type contract for API, web, and mobile. It owns:

- the complete `NotificationType` vocabulary and category partition;
- type labels and semantic icon keys;
- provider-neutral push payload shape;
- platform-neutral deep-link targets;
- preference keys, defaults, UI groups, strict legacy boolean parsing, and Zod patch validation.

`tools/audit-notification-contract.mjs` compares the shared contract against the Prisma enum and fails on missing, extra, duplicate, or unclassified types. Web and mobile translate the same logical target into their own route syntax; they do not reimplement type-to-entity decisions.

## Write and post-commit lifecycle

Writers continue to own their database transactions. Once committed, they call the application-facing `notificationDispatcher` in `apps/api/src/shared/notifications/notificationDispatcher.ts`:

1. `publishCreated` invalidates unread-count cache, schedules configured email fallback, and publishes `created` SSE events.
2. `publishDurable` fetches rows already committed by Go/SQL workers and sends them through the same `publishCreated` lifecycle.
3. `publishStateChange` invalidates unread cache and publishes `read`, `updated`, or `deleted` events.
4. `pushUser` / `pushUsers` expose a provider-neutral push interface to application services.

The dispatcher is deliberately post-commit. A cache, email, or SSE failure is logged and must not cause a committed business write to be retried.

## Delivery engines

The façade does not collapse two useful execution engines into one worker:

- BullMQ continues to provide queued/deferred work and bounded retries for Express-originated Web Push / FCM sends, with inline fallback when queueing is unavailable.
- `notification_push_dispatches` plus the Go worker continues to own durable per-device claims, leases, retry timing, and delivery state. Express remains the provider adapter for Web Push / FCM cryptography and delivery calls.

Both consume the same push payload contract and user preference semantics where those decisions are made in TypeScript. Go SQL paths keep their SQL-level equivalents aligned with the same documented preference keys/defaults. Database write ownership remains with each existing transactional writer.

## Read state and cross-device synchronization

The repository publishes:

- `created` after insert / insert-many;
- `read` after single, all, or conversation-related read transitions;
- `updated` after mark-unread and refresh-in-place transitions;
- `deleted` after explicit deletion and retention cleanup.

Bulk state changes omit a single notification ID so clients refetch the durable list. Web invalidates its notification queries on stream events. Mobile subscribes to the existing authenticated, resumable notification SSE stream while the screen is focused, batches bursts, refreshes list and unread count, and uses a bounded polling fallback only when streaming is unsupported.

## Client behavior

- API validation and category-to-type filtering use the shared category partition.
- Web metadata (labels/icons/targets/categories) comes from the shared contract.
- Mobile category chips and request query use the same categories; notification icons and destination decisions use shared metadata and targets.
- Both clients fall back safely to the notification inbox when a target cannot be resolved.

## Validation

Run from the monorepo root:

```bash
pnpm run audit:notification-contract
pnpm --filter @marketplat/contracts test
pnpm --filter classifieds-platform-backend type-check
pnpm --filter @marketplat/mobile type-check
pnpm --filter frontend test -- --run
make -C apps/go-worker test
make -C apps/go-worker vet
```

The static contract audit does not require installed dependencies. The package tests and TypeScript checks require the workspace dependencies to be installed. Live Postgres/Redis/FCM/Web Push integration is not implied by a passing static or unit test.
