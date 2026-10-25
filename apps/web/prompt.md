Act as a Principal Frontend Architect. Execute a comprehensive performance audit followed by fast, batched fixes. You have FULL AUTONOMY.

============================================================
CRITICAL SPEED RULES (NON-NEGOTIABLE)
============================================================
1. **FORBIDDEN: `npm run build` until the very last phase.** Use ONLY `npm run type-check` and targeted `npm run test` during work.
2. **Atomic commits:** One commit per fix, message format: `perf(<area>): <description>`.
3. **Read files ONE BY ONE** to avoid token limits. Do NOT batch-read large files.
4. **NO E2E tests.** NO deep analysis longer than 10s.
5. **SAFETY NET:** If type-check fails after a fix, `git restore .` that fix, document in `audit/bloat-discovery.md`, and move to next item.

============================================================
PHASE 0 — PRE-FLIGHT
============================================================
1. `git checkout -b feat/performance-audit-v2` (create fresh branch).
2. Confirm you're on the new branch before any edits.

============================================================
PHASE 1 — COMPREHENSIVE DISCOVERY
============================================================
Scan the entire `apps/web/` directory and `package.json`. For EACH item, record file paths and current state:

A. **Unoptimized Images:**
   - Find ALL `<img` tags in TSX files.
   - For each, note: is it static (imported asset) or dynamic (user upload/URL)?
   - Only static ones are safe to convert to `next/image`.

B. **Unused/Duplicate Libraries:**
   - In `package.json`, list every dependency.
   - For each, grep the codebase for imports. Note: which dependencies have ZERO usages.
   - Check for duplicates (multiple versions of same lib in `npm ls`).

C. **framer-motion Usage:**
   - Grep all files importing `framer-motion`.
   - Count how many components use it.
   - Identify if it's used in global providers (expensive) or isolated pages.

D. **Client Components That Can Be Server:**
   - Find files with `"use client"` that use NO hooks (`useState`, `useEffect`, `useRef`, `useContext`) and NO browser APIs (`window`, `localStorage`).
   - These are safe candidates to convert to Server Components.

E. **External Scripts:**
   - Find any `<script>` tags or `next/script` usages.
   - Flag any NOT using `strategy="lazyOnload"` or `afterInteractive`.

F. **Barrel File Imports:**
   - Find imports from `@/components/ui`, `@/components/shared`, etc. (paths that resolve to index.ts).
   - These pull entire folders into the bundle.

G. **Large Components (300+ lines):**
   - Find files > 300 lines. Note which are presentational (safe to split) vs interactive (risky).

Output everything to `audit/bloat-discovery.md` as a table:
| Item | Type | File(s) | Safe? | Est. Saving (kB) | Risk |

============================================================
PHASE 2 — PRIORITIZED PLAN
============================================================
From `audit/bloat-discovery.md`, create `audit/bloat-plan.md` with:
- Items sorted by: **Saving / Risk ratio (highest first)**.
- For each item: exact action, estimated bundle saving, estimated time.
- Group into 5 batches max, from safest to riskiest.

Print a CONCISE summary (max 10 lines) to the console, then IMMEDIATELY start Phase 3 without waiting for approval.

============================================================
PHASE 3 — FAST EXECUTION (BATCHES)
============================================================
For EACH item in `audit/bloat-plan.md`, in order:

1. **Apply the fix.** Examples:
   - Static `<img>` → `<Image>` from `next/image` (add `width`/`height`).
   - Unused dependency → `npm uninstall <pkg>`.
   - `"use client"` without hooks → remove the directive.
   - External script → convert to `next/script` with `strategy="lazyOnload"`.
   - Large component → extract sub-components.
   - Barrel import → change to direct import.

2. **Run ONLY `npm run type-check`.**

3. **If passes → `git add . && git commit -m "perf(<area>): <desc>"`.**
   **If fails → `git restore .`, log failure in `audit/bloat-discovery.md`, move on.**

4. **Move to next item. Do NOT run `npm run build`. Do NOT run `npm run test` globally.**

============================================================
PHASE 4 — FINAL VERIFICATION (ONCE)
============================================================
Only after ALL items processed:
1. Run `npm run build` EXACTLY ONCE.
2. Capture First Load JS for all routes.
3. Compare against `audit/rsc-baseline.md`.
4. For any route that INCREASED > 5%: identify the commit, `git revert <hash> --no-edit`, document.
5. Generate `audit/performance-final-report.md` with:
   - Final Before/After table.
   - Total kB saved.
   - List of ACCEPTED TECH DEBT.

============================================================
HARD RULES (NON-NEGOTIABLE)
============================================================
- NEVER run `npm run build` more than once (Phase 4).
- NEVER run E2E.
- NEVER break offline queuing or auth.
- ALWAYS preserve `.clineignore` file.
- Use FULL autonomy. Do not ask for permission between items.

Begin Phase 0 immediately. Do not explain. Just execute and report per batch.
