# Marketplat Offline UX — Phases 1 & 2 Delivery

This patch is a merge-ready overlay: extract it at the repository root. It includes the offline cache/warming/hydration fixes already present in the latest reviewed source snapshot, plus the Phase 1–2 audit report and the Phase 2 persistence-safety improvements.

Main Phase 1–2 changes:
- `frontend/lib/offlineQueryCache.ts`: shape-aware public-key allowlist, 64 KiB per-entry cap, actual restored payload-size validation.
- `frontend/__tests__/unit/lib/offlineQueryCache.test.ts`: regressions for public/private key boundaries and larger list payloads.
- `frontend/scripts/offline-phase12-audit.mjs`: dependency-free static guardrail.
- `frontend/docs/OFFLINE_PHASES_1_2_AUDIT.md`: findings, changes, verification, and remaining production checks.

The archive contains files that differ from the original `marketplat-main.zip`, not the full project. Existing static audit results are not a substitute for Vitest, TypeScript, production build, or real browser offline E2E tests.
