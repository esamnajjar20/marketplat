Act as a Principal Frontend Architect. We are executing a GLOBAL optimization campaign across the entire project. Execute the phases in order. After EACH phase, run `npm run type-check`, commit the changes, and move to the next phase.

============================================================
PHASE 1 — COST SAVINGS (LOW RISK, HIGH IMPACT)
============================================================

**1A. Lock the Warming Feature:**
- Locate the warming settings logic (e.g., `useWarming`, `warming-settings`).
- Change the default state to `'disabled'` and override any existing `localStorage` values to `'disabled'`.
- In the UI, disable (grey out) "تسخين سريع" and "تسخين كامل". Keep "إيقاف التسخين" as the only active option.
- Do NOT delete `sw.js` or `generate-warming-manifest.mjs`.

**1B. Delete Backup Files:**
- Find and delete all `.bak` and `.bak-*` files from `frontend/public/`.
- Ensure `*.bak` is in `.gitignore`.

**1C. Fix Outbox Worker Polling:**
- Locate `outbox.worker.ts` (backend).
- Change `POLL_INTERVAL_MS` from `1000` (1s) to an exponential backoff: 1s → 2s → 5s → 10s (max) when idle, reset to 1s immediately when a job appears.

============================================================
PHASE 2 — FRONTEND PERFORMANCE (MEDIUM RISK)
============================================================

**2A. Replace `@fontsource` with `next/font`:**
- Remove `@fontsource` imports from `layout.tsx` or `globals.css`.
- Use `next/font/google` (or `next/font/local` if custom).
- Update `sw.js` to cache the new font assets for offline use.

**2B. Replace Static `<img>` with `next/image`:**
- Find safe static `<img>` tags (e.g., in `EmptySearchSuggestions.tsx`, `DownloadStoreCatalogButton.tsx`, `ReceiptPageClient.tsx`) and replace with `next/image`. Add `width` and `height`.
- DO NOT touch dynamic image uploads (`ImageUpload.tsx`, `StoryComposer.tsx`).

============================================================
PHASE 3 — HEAVY DEPENDENCIES (HIGH RISK, SAFETY NET)
============================================================

**3A. Replace `axios` with Native `fetch` / `ky`:**
- In `"use client"` files, replace `axios` and `@/api/client` imports with native `fetch` or `ky`.
- **SAFETY NET:** For `MessageInput.tsx` and `sendConversationMessage.ts`, migrate the offline queue to `TanStack Query`'s `useMutation` with `networkMode: 'offlineFirst'`. If this breaks the PWA, REVERT only these files and document as `ACCEPTED TECH DEBT`.

**3B. Convert Infinite Scroll to Load More (where safe):**
- For `/products`, `/services`, `/stores`: Replace `IntersectionObserver` with a Server Component that renders initial data + a small `"use client"` `LoadMoreButton` that fetches the next page.
- **SAFETY NET:** If converting increases bundle size, REVERT and document as `DEFERRED`.

============================================================
PHASE 4 — BUG FIXES (INDEPENDENT)
============================================================

**4A. Fix Search Facets `q` Filter:**
- In `search.facets.repository.ts`, ensure price-range counts respect the same `WHERE q` filter as the main search. Add a test.

============================================================
STRICT RULES & CONTEXT MANAGEMENT
============================================================
1. Read files ONE BY ONE. Do NOT read multiple large files simultaneously (to avoid token limits).
2. After EACH phase: Run ONLY `npm run type-check`. DO NOT run `npm run test` or `npm run build`.
3. Commit after EACH sub-task: `perf: <task description>` or `fix: <task description>`.
4. If any task fails `type-check`, revert that specific task and document it in `audit/rsc-report.md`.
5. NEVER break offline queuing (PWA). When in doubt, revert and document.

Begin Phase 1 immediately. Do not ask for permission.
