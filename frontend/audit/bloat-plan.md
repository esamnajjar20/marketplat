# Bloat Plan — Phase 2

Sorted by Saving / Risk ratio (highest first). Grouped into 5 batches, safest → riskiest.
Rule: one fix → `npm run type-check` → (pass) `git commit -m "perf(<area>): <desc>"`; (fail) `git restore .`, log, move on. No `npm run build` until Phase 4.

---

## Batch 1 — Uninstall unused dependencies (safest, highest saving/risk)

| # | Action | Est. Saving | Risk | Commit msg |
|---|--------|-------------|------|------------|
| B1 | `npm uninstall tesseract.js` | High | Low | `perf(deps): uninstall unused tesseract.js` |
| B2 | `npm uninstall react-hook-form` | Medium | Low | `perf(deps): uninstall unused react-hook-form` |
| B3 | `npm uninstall @hookform/resolvers` | Small | Low | `perf(deps): uninstall unused @hookform/resolvers` |
| B4 | `npm uninstall @tanstack/react-table` | Medium | Low | `perf(deps): uninstall unused @tanstack/react-table` |
| B5 | `npm uninstall @radix-ui/react-label` | Tiny | Low | `perf(deps): uninstall unused @radix-ui/react-label` |

## Batch 2 — External scripts → `next/script lazyOnload`

| # | Action | Est. Saving | Risk | Commit msg |
|---|--------|-------------|------|------------|
| E1 | `app/layout.tsx`: dev-only `<script src="/hydration-trace.js" />` → `next/script` `strategy="lazyOnload"` | Tiny | Low-med | `perf(scripts): lazy-load hydration-trace.js` |
| E2 | Nonce-bearing JSON-LD `<script>` tags in `app/layout.tsx` | — | — | SKIP (must stay server-rendered for SEO/nonce) |
| E3 | Page-level `<script>` tags in `(public)` routes — review each; convert non-nonce to `next/script lazyOnload` | Small | Low-med | per-file |

## Batch 3 — Barrel imports → direct imports

| # | Action | Est. Saving | Risk | Commit msg |
|---|--------|-------------|------|------------|
| F1 | `@/components/shared/ui/*` → direct file imports (already mostly direct; verify no wholesale barrel import) | Small | Low-med | `perf(imports): direct-import ui components` |
| F2 | `@/lib/offline`, `@/lib/runtime` barrel → direct sub-module imports where only one symbol used | Small | Low-med | `perf(imports): direct-import lib submodules` |

## Batch 4 — `"use client"` → Server Component (verified hook-free only)

| # | Action | Est. Saving | Risk | Commit msg |
|---|--------|-------------|------|------------|
| D1 | Per-file: remove `"use client"` from client components using NO hooks & NO browser APIs | Medium | Medium | `perf(ssr): convert <file> to Server Component` |
| | Only after reading file and confirming hook-free. | | | |

## Batch 5 — Split presentational large components (>300 lines)

| # | Action | Est. Saving | Risk | Commit msg |
|---|--------|-------------|------|------------|
| G1 | Split clearly-presentational large components (not offline-queue/auth state owners) | Medium | Medium-high | `perf(components): split <file>` |
| | Only after verifying no hooks/browser API coupling. | | | |

---

## Acceptance

- Every accepted fix: `npm run type-check` passes → commit.
- Any fix failing type-check: `git restore .`, log in `bloat-discovery.md`, move on.
- Phase 4: single `npm run build`, compare First Load JS vs baseline, revert any route > +5%.
