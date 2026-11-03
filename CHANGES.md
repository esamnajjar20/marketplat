# Phase 2 changes only

## Modified
- apps/mobile/app/index.tsx
- apps/mobile/app/ad-editor.tsx
- apps/mobile/src/features/discovery/useHomeScreenState.ts

## New
- apps/mobile/src/features/ads/useAdEditorCategories.ts
- apps/mobile/src/storage/outbox-manager.ts
- apps/mobile/src/storage/README.md
- apps/mobile/src/state/session-flags.ts
- docs/mobile/PHASE2-ARCHITECTURE.md

Apply on top of Phase 0+1 tree (or main + phase 0-1).

## Redis Multi-Service
- Added isolated Redis endpoints for sessions, rate limits, Pub/Sub, BullMQ, presence, shared API/Go buffers and disposable cache, with backward-compatible fallback to the existing primary Redis client.
- Routed auth/session, rate-limit, notification Pub/Sub, queue and presence call sites to their logical clients; added protected admin health visibility and graceful closure for unique clients.
- Added one shared buffer endpoint used by both API and Go Worker, plus Go Worker buffer aliases and shared cache URL support. See `REDIS-MULTISERVICE-IMPLEMENTATION-AR.md` for migration safety and provider limitations.


## Go adaptive replica load balancing
- Extended Smart Gateway Go replica routing with admin-controlled manual shares plus adaptive weighting from routed request latency, failure EWMA, and Go process active-work signals.
- Added a private Go concurrency hint for internal routes; active work includes HTTP requests, Outbox/Push Dispatch claimed work, and search-index refresh execution. The gateway removes this internal header before returning responses to Express.
- Exposed instantaneous and moving-average load metrics plus manual/effective shares in Infrastructure Management; no Cron, warmup, scheduled health probe, or background monitor was added.
- Preserved SQL `SKIP LOCKED` leases for multi-replica queue consumption and advisory locks for singleton scheduled work.
