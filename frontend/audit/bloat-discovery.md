# Bloat Discovery — Phase 1 (frontend/)

Branch: `feat/performance-audit-v2` | Date: 2026-10-23
Scope: `app/`, `components/`, `lib/`, `hooks/`, `providers/`, `store/`, `package.json`
Excluded: `node_modules/`, `.next/`, `package-lock.json`, `public/` static wasm assets

Legend: Safe? = safe to fix in Phase 3 without breaking offline queuing / auth / builds.
Est. Saving = First-Load-JS / bundle impact (kB), rough.

---

## A. Unoptimized Images (`<img` tags)

All `<img` tags found in TSX/TS use **dynamic** sources (user uploads, image previews, QR data URLs, Cloudinary thumbnail URLs, inline data-URI template strings). None are static imported assets, so **none are safe to convert to `next/image`**.

---

## B. Unused / Duplicate Libraries

`package.json` dependencies grepped across all source (`.ts` `.tsx` `.mjs` `.js`), excluding `node_modules`/`.next`/`package-lock`.

| Dependency | Files using it | Verdict | Est. Saving | Risk | Notes |
|---|---|---|---|---|---|
| `tesseract.js` | 0 | **UNUSED** | High (~node_modules) | Low | `public/tesseract/` wasm is a static asset (runtime OCR loads from `public/`, not npm import). `scripts/sync-tessdata.mjs` warns gracefully if `node_modules/tesseract.js` absent; postinstall has `|| true`. |
| `react-hook-form` | 0 | **UNUSED** | Medium | Low | No source imports. |
| `@hookform/resolvers` | 0 | **UNUSED** | Small | Low | No source imports. |
| `@tanstack/react-table` | 0 | **UNUSED** | Medium | Low | No source imports. |
| `@radix-ui/react-label` | 0 | **UNUSED** | Tiny | Low | No source imports. |
| `@fontsource/cairo` | 0* | Unused candidate | Tiny | Low | `app/layout.tsx` uses `next/font/google`; `globals.css` only declares CSS vars. `@fontsource` pkgs appear unimported. Low bundle impact (fonts aren't in JS bundle). |
| `@fontsource/ibm-plex-mono` | 0 | Unused candidate | Tiny | Low | Same as above. |
| `@fontsource/ibm-plex-sans-arabic` | 0 | Unused candidate | Tiny | Low | Same as above. |
| `@capacitor/android` | 0 | Platform pkg | Tiny | Medium | Part of Capacitor toolchain; not imported but `cap sync` may expect it. Defer. |
| `@capacitor/ios` | 0 | Platform pkg | Tiny | Medium | Same as above. Defer. |

Used & keep: `sonner`, `next-themes`, `leaflet`, `react-leaflet`, `axios`, `lucide-react`, `zustand`, `clsx`, `tailwind-merge`, `class-variance-authority`, `zod`, `@capacitor/{app,camera,geolocation,haptics,preferences,push-notifications,share,splash-screen,status-bar,core}`, `@radix-ui/{avatar,dialog,dropdown-menu,select,separator,slot}`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `next`, `react`, `react-dom`, `qrcode`.

**Duplicate versions (`npm ls`):** not yet checked; no obvious duplicates in `package.json`.

**B actionable (high saving/low risk):** uninstall `tesseract.js`, `react-hook-form`, `@hookform/resolvers`, `@tanstack/react-table`, `@radix-ui/react-label`.

| # | File | Line | `src` | Static? | Safe? | Est. Saving | Risk |
|---|------|------|-------|---------|-------|-------------|------|
| A1 | `components/search/EmptySearchSuggestions.tsx` | 147 | `ad.thumbnail` | No (ad URL) | No | 0 | Low |
| A2 | `components/stores/ProductFormPreview.tsx` | 76 | (image prop) | No | No | 0 | Low |
| A3 | `components/stores/DownloadStoreCatalogButton.tsx` | 167/209/417 | embedded data URI (template HTML) | No | No | 0 | Low |
| A4 | `components/messages/MessageImageViewer.tsx` | 128/143 | gallery image URLs | No | No | 0 | Low |
| A5 | `components/messages/MessageInput.tsx` | 348 | `imagePreview` | No (client preview) | No | 0 | Low |
| A6 | `components/sales/ReceiptPageClient.tsx` | 71 | `qr` | No (QR data URL) | No | 0 | Low |
| A7 | `components/ads/AdFormPreview.tsx` | 66 | `imageSrc` | No (preview) | No | 0 | Low |
| A8 | `components/shared/ui/SafeImg.tsx` | 38 | prop | No | No | 0 | Low |
| A9 | `components/shared/forms/ImageUpload.tsx` | 428/501 | `url` | No (upload preview) | No | 0 | Low |
---

## C. framer-motion Usage

**None.** Zero files import `framer-motion`. Not in `package.json`. No action.

---

## D. `"use client"` Files (Server Component candidates)

Files with `"use client"` include `app/(admin)/admin/debug/warming/page.tsx`, error pages, `app/(protected)/layout.tsx`, several `[id]/edit/page.tsx`, `app/(public)/requests/[id]/{layout,page}.tsx`, `app/offline/page.tsx`, `app/update/page.tsx`, plus ~80+ client components under `components/`.

**Criteria for safe conversion:** no hooks (`useState`/`useEffect`/`useRef`/`useContext`) and no browser APIs (`window`/`localStorage`/`navigator`/`document`).

Most admin/data-table/client components use hooks → risky. Presentational shells need per-file verification (read one-by-one). Defer to Batch 4; only convert files verified hook-free.

---

## E. External Scripts

| File | Script | strategy? | Notes |
|---|---|---|---|
| `app/layout.tsx` | `<script src="/hydration-trace.js" />` | No | Dev-only (`process.env.NODE_ENV !== 'production'`). Candidate for `next/script` `strategy="lazyOnload"` — dev-only, minimal impact. |
| `app/layout.tsx` | 2× `<script type="application/ld+json" nonce={nonce}>` | n/a | JSON-LD with per-request CSP nonce — cannot lazy-load (SEO). Skip. |
| `app/(public)/stores/[id]/page.tsx:98` | `<script>` | — | Check |
| `app/(public)/ads/[id]/page.tsx:59` | `<script>` | — | Check |
| `app/(public)/products/[id]/page.tsx:66` | `<script>` | — | Check |
| `app/(public)/services/[id]/page.tsx:98` | `<script>` | — | Check |
| `app/(public)/requests/[id]/layout.tsx:86` | `<script>` | — | Check |
| `app/(public)/page.tsx:32` | `<script>` | — | Check |
| `lib/structuredData.ts` | builds JSON-LD `<script>` strings | n/a | RSC-rendered, skip. |

**E actionable:** convert dev-only / non-nonce `<script>` tags to `next/script` with `strategy="lazyOnload"` where safe. Nonce-bearing JSON-LD must stay.

| A10 | `components/stories/StoryComposer.tsx` | 60 | `preview` | No | No | 0 | Low |
| A11 | `components/services/ServiceListingFormPreview.tsx` | 67 | `imageSrc` | No | No | 0 | Low |
---

## F. Barrel File Imports (pull whole folders)

Barrel `index.ts` files: `components/shared/ui/index.ts`, `components/shared/skeletons/index.ts`, `lib/runtime/index.ts`, `lib/offline/index.ts`, `lib/i18n/ar/index.ts`.

Imports observed from barrel paths (pull entire folder):
- `@/components/shared/ui/Button`, `Badge`, `SafeImage` (via `components/shared/ui/index.ts`)
- `@/components/ui/spinner` (direct file — OK)
- `@/lib/offline` (barrel — pulls whole offline subsystem)
- `@/lib/runtime` (barrel)

**F actionable:** convert barrel imports to direct file imports where a single component is needed; verify no wholesale `from '@/components/shared/ui'`.

---

## G. Large Components (>300 lines)

| Lines | File | Presentational? | Safe to split? |
|---|------|-----------------|----------------|
| 1992 | `lib/offlineRouteShells.ts` | No (lib logic) | Risky |
| 859 | `components/stores/ProductForm.tsx` | Interactive (form) | Risky |
| 812 | `components/services/ServiceListingForm.tsx` | Interactive | Risky |
| 802 | `hooks/mutations/useAdminMutations.ts` | No (hook) | Risky |
| 787 | `components/settings/SyncCenterClient.tsx` | Interactive | Risky |
| 773 | `components/ads/AdForm.tsx` | Interactive | Risky |
| 769 | `components/settings/OfflineRoutesList.tsx` | Presentational-ish | Maybe |
| 746 | `lib/offlineQueue.ts` | No (logic) | Risky |
| 733 | `components/messages/ChatWindow.tsx` | Interactive | Risky |
| 728 | `components/offline/OfflineHub.tsx` | Mixed | Risky |
| 687 | `components/payments/SavedPaymentsPageClient.tsx` | Interactive | Risky |
| 650 | `lib/offlineAdDrafts.ts` | No | Risky |
| 644 | `components/requests/CreateRequestForm.tsx` | Interactive | Risky |
| ... | 40+ more files 304–566 lines | mixed | per-file review |

**G actionable:** split only clearly-presentational large components after verifying they don't manage offline queue/auth state. Defer to Batch 5.

---

## Summary of Actionable Items (Phase 2 input)

1. Uninstall `tesseract.js` (high saving, low risk)
2. Uninstall `react-hook-form` (med, low)
3. Uninstall `@hookform/resolvers` (small, low)
4. Uninstall `@tanstack/react-table` (med, low)
5. Uninstall `@radix-ui/react-label` (tiny, low)
6. Convert dev-only / non-nonce `<script>` → `next/script lazyOnload` (small, low-med)
7. Barrel imports → direct imports (small, low-med)
8. `"use client"` → Server Component (verified hook-free files only) (med, med)
9. Split presentational large components (med, med-high)

| A12 | `components/settings/SyncCenterClient.tsx` | 725 | `u` | No | No | 0 | Low |

**A total: 0 kB safe saving.** No actionable `next/image` conversions.
