# Priority 6 Architectural Cleanup — Report

Generated: 2026-10-23 | Repo: marketplat/frontend | Branch: main

## Counts

| Task | Action | Count |
|------|--------|-------|
| A | `use client` removed → Server Component | 1 |
| A | `use client` retained (skipped — uses hooks/event handlers/browser APIs) | 38 |
| B | Large presentational component split into sub-components | 0 |
| B | Blocked — requires interactive split (not purely presentational) | 5 |
| C | Barrel import → direct file import | 0 |
| C | Blocked — none (no barrel imports found) | 0 |

## Task A — Convert unnecessary "use client" files

### Converted (1)
| File | Commit |
|------|--------|
| `components/search/FacetCountBadge.tsx` | `c5192e18 refactor(rsc): make FacetCountBadge a Server Component` |

### Skipped — retains `use client` (38)
Every skipped file reads at least one of: React hooks (`useState`/`useEffect`/`useReducer`/`useRef`/`useContext`/`useCallback`/`useMemo`/`useSearchParams`/`useRouter`/custom hooks), browser APIs (`window`/`document`/`localStorage`/`navigator`), or client-only event handlers (`onClick`/`onChange`/`onSubmit`/`onKeyDown`). Removing `use client` would break interactivity. See `audit/arch-cleanup-log.md` for the full per-file reason list.

## Task B — Split large presentational components (>500 lines)

### Top 5 by line count — all blocked (requires interactive split)
None are purely presentational; each is an interactive form/list that reads hooks, browser APIs, or event handlers, so a presentational-only sub-component split is unsafe and could break behavior.

| File | Lines | Reason blocked |
|------|-------|----------------|
| `components/stores/ProductForm.tsx` | 859 | `useState`/`useEffect`/`useRef`/`useSearchParams`/`useRouter`/`onChange`/`window.history` |
| `components/services/ServiceListingForm.tsx` | 812 | `useState`/`useEffect`/`useRef`/`useSearchParams`/`useRouter`/`onChange`/`window.scrollTo`/`onSubmit` |
| `components/settings/SyncCenterClient.tsx` | 787 | `useState`/`useCallback`/`useEffect`/`useMemo`/`window.addEventListener` |
| `components/ads/AdForm.tsx` | 773 | `useState`/`useEffect`/`useRef`/`useSearchParams`/`useRouter`/`onChange`/`window.history` |
| `components/settings/OfflineRoutesList.tsx` | 769 | `useState`/`useCallback`/`useEffect`/`useRef`/`useMemo`/`window.setInterval` |

Result: 0 components split.

## Task C — Fix barrel imports

### Search performed
- `grep -rn "from '@/components/shared/ui." components app --include="*.tsx"` → only direct file imports (`ui/Button`, `ui/Input`, ...), zero barrel-index imports.
- `grep -rn "from '@/components/shared/skeletons." components app --include="*.tsx"` → only direct file imports (`skeletons/TableSkeleton`, ...), zero barrel-index imports.
- Direct probe `from '@/components/shared/ui'` / `from '@/components/shared/skeletons'` → zero matches.

### Result
No barrel imports exist in `components` or `app` for these folders; all imports already target specific file paths. 0 files fixed.

## BLOCKED items summary (with reasons)

**Task A — 38 `use client` files blocked:** each uses React hooks and/or browser APIs and/or event handlers, so it must remain a Client Component. Full per-file reasons in `audit/arch-cleanup-log.md`.

**Task B — 5 large components blocked:** all are interactive (forms/lists with hooks + event handlers), documented as "requires interactive split":
- `components/stores/ProductForm.tsx` (859 lines)
- `components/services/ServiceListingForm.tsx` (812 lines)
- `components/settings/SyncCenterClient.tsx` (787 lines)
- `components/ads/AdForm.tsx` (773 lines)
- `components/settings/OfflineRoutesList.tsx` (769 lines)

**Task C — 0 blocked:** nothing to fix (no barrel imports found).

## Excluded (never touched, per safety rules)
`apps/web/api/client.ts` (axios), `error.tsx`, `global-error.tsx`, any file importing axios directly, anything in `apps/web/providers/`.

## Verification
- `npm run type-check` (`tsc --noEmit`) passed after the single `use client` removal (`FacetCountBadge.tsx`).
- `npm run build` and `npm run test` were NOT run (hard rule).
- ONE FILE = ONE COMMIT honored for the code change.