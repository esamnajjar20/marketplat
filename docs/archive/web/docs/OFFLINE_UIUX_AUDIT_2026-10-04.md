# Offline Center UI/UX Audit — 2026-10-04

## Scope

Second, UI/UX-only pass for the Offline Center. This pass preserves the offline/security behavior from the previous session and does not change API, queue semantics, cache policy, or synchronization logic.

## Findings fixed

- The standalone `/offline` shell was constrained to a narrow `max-w-2xl`, wasting desktop space. It now uses a wide responsive shell while keeping the fallback status hero visually focused.
- The Offline Hub itself was narrow and visually mixed with the fallback page. It now has a dedicated wide dashboard surface with consistent desktop width and containment.
- Offline tabs used `top-0`, which could visually collide with surrounding navigation/shells. They now use a small safe offset, stronger surface treatment, and scroll margin.
- The synchronization center duplicated the meaning of queue/pending counts. Its three summary cards now communicate three distinct concepts: queued requests, unsent drafts, and items needing attention.
- Sync empty states were plain text. They now provide clear, reassuring empty-state surfaces.
- Storage usage now exposes an accessible progressbar and the approximate remaining quota.
- Warming modes now use explicit radio semantics and become a three-column option grid on larger screens.
- Warming controls use a desktop two-column action layout with the primary action spanning the full row.
- Warming status uses a wider, more readable three-column summary on larger screens.
- Offline freshness badges now have a compact pill treatment and a clock icon for faster visual scanning.

## Verification

- `sw.js` passed `node --check`.
- TypeScript parser check was run against all modified TS/TSX files with `tsc --noEmit --noResolve`. No syntax/parsing diagnostics were produced. Full type-check is unavailable without project dependencies (`node_modules`).
- The delivery ZIP contains only files changed/added in this UI/UX session.
