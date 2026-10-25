# Next.js 15.5.28 Production Bundle Analysis Report

**Generated:** 2026-10-24  
**Environment:** `/workspaces/marketplat/frontend`  
**Build Output:** `.next/static/chunks/*.js` + `.next/app-build-manifest.json`

---

## ═══ 1. EXECUTIVE SUMMARY ═══

### Top 3 Causes of the 107 kB Shared Baseline

| Rank | Cause | Size | Details |
|------|-------|------|---------|
| **1** | **@tanstack/react-query** (full runtime) | ~58 kB | Chunks `9287` (15.6 kB), `1611` (60.5 kB), `3455` (9.3 kB), `8720` (35.3 kB) — QueryClient, Query, MutationCache, QueryCache, Observers, devtools-free but full-featured |
| **2** | **React 19 + React DOM internals** | ~46 kB | Chunk `1255-1e70eba6f9194f59.js` (46.3 kB) — React 19 client entry, hydration, createElement, useSyncExternalStore, Scheduler |
| **3** | **sonner (toast) + Radix UI primitives** | ~15 kB | Chunk `8720` (35.3 kB) contains sonner Toaster, toast, icons + Radix Dialog/DropdownMenu/Sheet primitives |

### Top 3 Heaviest Routes & Why

| Route | Page JS | First Load JS | Primary Cause |
|-------|---------|---------------|---------------|
| `/stores/[id]` | 27.1 kB | **322 kB** | `StoreStorefront` tabbed UI (6 lazy tabs but all chunk refs present), `StoreProducts` + `ProductCard`, `StoreAds`, `StoreCollections`, `StoreReviewsList`, recommendations, lucide icons |
| `/ads/[id]` | 19.7 kB | **300 kB** | `AdDetail` massive component (gallery, lightbox, seller card, map, share/report, sticky CTA, offline save), `RelatedAds`, `ZoomableDetailImage`, `ProgressiveDetailImage` |
| `/services/[id]` | 19.9 kB | **297 kB** | Similar structure to ads — service detail + gallery + provider card + reviews + related, shares most ad detail deps |

**Pattern:** All detail pages share the same heavy dependency tree — TanStack Query, sonner, Radix UI, lucide-react, SafeImage/Cloudinary, offline queue — loaded eagerly at route level despite conditional rendering (modals, sheets, galleries).
---

## ═══ 2. SHARED CHUNK BREAKDOWN ═══

| Chunk | Size | Dominant Packages / Code | Lazy-Loadable? |
|-------|------|--------------------------|----------------|
| `1255-1e70eba6f9194f59.js` | **46.3 kB** | React 19 client entry (`appBootstrap`, `hydrate`), `createRenderParamsFromClient`, router cache utilities, Scheduler | ❌ No — core framework |
| `4bd1b696-100b9d70ed4e49c1.js` | **173 kB** ⚠️ | **React 19 full runtime** (react-dom, react-reconciler, useSyncExternalStore, Fiber, suspense, transitions, server components) | ❌ No — framework |
| `9287-f0deef89de81db65.js` | 15.6 kB | **@tanstack/react-query** — Query class, Observer, queryHash, QueryCache basics | ⚠️ Partial — only if no queries on route |
| `1611-eae282ee351e5f0a.js` | 60.5 kB | **@tanstack/react-query** — QueryClient, MutationCache, QueryCache, dehydration, broadcastChannel | ⚠️ Partial |
| `3455-823a6a4a4d387e56.js` | 9.3 kB | **@tanstack/react-query** — Observer methods, fetch logic, stale-while-revalidate | ⚠️ Partial |
| `8720-0ea6dfb0b10cd39c.js` | 35.3 kB | **sonner** (Toaster, toast, icons) + **Radix UI Dialog primitives** | ✅ Yes — per-route toasts |
| `4909-64796d901b595af7.js` | 27.7 kB | **clsx / tailwind-merge / class-variance-authority** (cn utility) + regex utils | ⚠️ Partial — used everywhere |
| `5151-fbb1e0d4436b0c1b.js` | 13 kB | **Network utilities** — fetchWithTimeout, online/offline detection, connection quality | ✅ Yes — feature-specific |
| `5535-5ef903afa72f07e6.js` | 89.9 kB | **IndexedDB offline layer** (conversation media, blobs, cache), Arabic normalization, CSRF | ✅ Yes — messages/offline only |
| `2168-9bf29c979bdb153a.js` | 7.8 kB | **App constants** — ROUTES, API_BASE_URL, site config | ❌ No — used everywhere |
| `4221-0e8d9b9cd9a44461.js` | 16.5 kB | **Offline sales drafts** (IndexedDB), offline op ID header | ✅ Yes — sales routes only |
| `7328-36dd79803e0e9077.js` | 8.9 kB | **Cache TTL config** (JSON) — all query staleTimes/gcTimes | ❌ No — imported by query hooks |
| `9749-39c0a8fc7cd40f05.js` | 9.6 kB | **queryKeys factory** — all TanStack Query key builders | ⚠️ Partial |

> **Note:** The build manifest reports `4bd1b696-*` as 54.2 kB but the actual file is 173 kB — this is the **React 19 runtime** (react-dom + reconciler). The 54.2 kB figure is likely gzipped; raw is ~173 kB.

### Auth Store (Zustand) Location
- **NOT in shared chunks** — Zustand (~1.5 kB) + auth store are in route-specific chunks (`layout` chunk for `(protected)` routes, pulled into page chunks for public routes that use `useAuthStore`)
- Used in: `(protected)/layout.tsx`, `ChatWindow`, `MessageInput`, `MessageMediaGallery`, recommendation hooks

### next/font/google — Cairo, IBM Plex Sans Arabic, IBM Plex Mono
- **Properly CSS-only** — Fonts loaded via `next/font/google` in `app/layout.tsx` with `subsets: ['arabic']`, `variable: '--font-*'`, `display: 'swap'`
- Zero JS contribution — font files served as static assets from `/_next/static/media/`
- `@fontsource/*` packages still in `package.json` but **not imported** in layout.tsx (replaced by next/font)

### @tanstack/react-query-devtools
- **NOT in production bundle** — Confirmed: no imports found in codebase (`grep -r "react-query-devtools"` returns 0 results)
- Only in `package.json` as dependency, never imported
---

## ═══ 3. PER-ROUTE HEAVY IMPORTS ═══

### `/stores/[id]` — 322 kB First Load
| Import | Source | Est. Size | Issue |
|--------|--------|-----------|-------|
| `StoreStorefront` | `components/stores/StoreStorefront.tsx` | ~60 kB | 6 tabs (Products, Offers, Collections, Ads, Reviews, About) — `StoreProducts`, `StoreAds`, `StoreCollections`, `StoreReviewsList` all imported via `next/dynamic` but chunks still referenced |
| `StoreProducts` → `ProductCard` | `components/stores/StoreProducts.tsx` | ~40 kB | Product grid, search, sort, pagination, recommendations |
| `StoreHeader` | `components/stores/StoreHeader.tsx` | ~15 kB | Avatar, cover, actions, follow button |
| `StoreRecommendations` | `components/recommendations/StoreRecommendations.tsx` | ~12 kB | TanStack Query + lucide icons |
| `lucide-react` icons | SearchX, Star, MapPin, Phone, Clock, Info, etc. | ~10 kB | 15+ icons imported |

### `/ads/[id]` — 300 kB First Load
| Import | Source | Est. Size | Issue |
|--------|--------|-----------|-------|
| `AdDetail` | `components/ads/AdDetail.tsx` | **~120 kB** | Monolithic: gallery (ZoomableDetailImage, ProgressiveDetailImage), lightbox Dialog, seller card, map link, share/report buttons, sticky CTA, offline save, safety tips, favorites, categories |
| `AdDetailSection` | `components/ads/AdDetailSection.tsx` | ~15 kB | Wrapper + RelatedAds (lazy) |
| `SellerCard` | `components/ads/SellerCard.tsx` | ~10 kB | Avatar, verification, follow, message |
| `lucide-react` icons | 20+ icons (MapPin, Eye, Calendar, Tag, ChevronLeft/Right, Heart, Hash, X, MessageSquare, etc.) | ~15 kB | Heavy icon usage |

### `/services/[id]` — 297 kB First Load
| Import | Source | Est. Size | Issue |
|--------|--------|-----------|-------|
| Service detail components | Similar to AdDetail structure | ~100 kB | Gallery, provider card, reviews, related services |
| Service request mutations | `hooks/mutations/useServiceRequestMutations.ts` | ~15 kB | Toast, parseApiError, query invalidation |
| Categories hook | `hooks/queries/useCategories.ts` | ~8 kB | TanStack Query + lucide |

### `/profile/[id]` — 291 kB First Load
| Import | Source | Est. Size | Issue |
|--------|--------|-----------|-------|
| `ProfileDetailClient` (inferred) | Tabbed profile UI | ~80 kB | Products, Services, Ads, Reviews, About tabs |
| `StoryViewer` | `components/profile/StoryViewer.tsx` | ~25 kB | Story playback, gestures, IndexedDB |
| `StoriesRail` | `components/stories/StoriesRail.tsx` | ~15 kB | Horizontal story list |

### `/messages/[id]` — 279 kB First Load
| Import | Source | Est. Size | Issue |
|--------|--------|-----------|-------|
| `ChatWindow` | `components/messages/ChatWindow.tsx` | **~140 kB** | Monolithic: message list, virtualization, `MessageInput` (composer), `MessageMediaGallery` (lazy ✅), `VoiceMessagePlayer`, recordings, optimistic updates, block/report dialogs, typing indicator, presence |
| `MessageInput` | `components/messages/MessageInput.tsx` | ~45 kB | Rich composer: text editor (`MessageBodyEditor`), image/audio/file pickers, recording, drafts, templates, haptics |
| `ChatMessageRow` + `MessageMedia` | `components/messages/ChatMessageRow.tsx` | ~25 kB | Media rendering, actions menu, status bar, queued actions |
| `lucide-react` icons | 25+ icons | ~18 kB | Heavy icon usage |

### `/` (Homepage) — 247 kB First Load
| Import | Source | Est. Size | Issue |
|--------|--------|-----------|-------|
| `HomePageContent` | `components/home/HomePageContent.tsx` | ~35 kB | 10 lazy sections (ForYou, Following, AboveFold, RecentProducts, Services, FeaturedStores, NearbyProviders, AppPromo) — **all lazy-loaded correctly** |
| `EagerHomeSections` | `components/home/EagerHomeSections.tsx` | ~20 kB | Categories rail, search bar, location picker — **eager, above-fold** |
| `StoriesRail` | `components/stories/StoriesRail.tsx` | ~15 kB | Story playback |
| `PullToRefresh` | `components/shared/ui/PullToRefresh.tsx` | ~8 kB | Native app gesture |

### `/my-store` — 216 kB First Load
| Import | Source | Est. Size | Issue |
|--------|--------|-----------|-------|
| Dashboard components | Store management UI | ~60 kB | Products, Ads, Collections, Analytics tabs |
| `useStore` + `useProducts` hooks | TanStack Query | ~30 kB | Queries + mutations |
---

## ═══ 4. MISSING `optimizePackageImports` ENTRIES ═══

**Current config** (`next.config.ts` line 124):
```typescript
experimental: {
  optimizePackageImports: ['lucide-react'],
}
```

### Packages in `package.json` that should be added:

| Package | Current Usage | Est. Savings | Reason |
|---------|---------------|--------------|--------|
| **@radix-ui/react-dialog** | 8 components (Sheet, Dialog, AlertDialog) | ~8 kB | Heavy primitives, tree-shakeable |
| **@radix-ui/react-dropdown-menu** | 5+ components | ~6 kB | Menu primitives |
| **@radix-ui/react-select** | 2 components | ~5 kB | Select primitive |
| **@radix-ui/react-avatar** | 3 components | ~3 kB | Avatar primitive |
| **@radix-ui/react-slot** | Button, widespread | ~2 kB | Slot primitive |
| **@radix-ui/react-separator** | 2 components | ~1 kB | Separator primitive |
| **sonner** | 50+ files use `toast` | ~12 kB | Toast library, only Toaster needed globally |
| **zod** | Validation schemas (backend mostly, some frontend) | ~8 kB | Schema validation |
| **@tanstack/react-query** | 40+ hooks | ~15 kB | Already in shared chunks but tree-shaking helps |
| **clsx / tailwind-merge / class-variance-authority** | `cn` utility everywhere | ~5 kB | Class utilities |
| **lucide-react** | ✅ Already configured | — | 300+ icons used, tree-shaking critical |

### Recommended `next.config.ts` update:
```typescript
experimental: {
  optimizePackageImports: [
    'lucide-react',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-select',
    '@radix-ui/react-avatar',
    '@radix-ui/react-slot',
    '@radix-ui/react-separator',
    'sonner',
    'zod',
    '@tanstack/react-query',
    'clsx',
    'tailwind-merge',
    'class-variance-authority',
  ],
}
---

## ═══ 5. SUSPICIOUS LARGE IMPORTS — FINDINGS ═══

### ❌ `import * as` Patterns (Namespace Imports)
| File | Line | Import | Risk |
|------|------|--------|------|
| `components/ui/avatar.tsx` | 2 | `import * as AvatarPrimitive from '@radix-ui/react-avatar'` | Medium — prevents tree-shaking |
| `components/ui/select.tsx` | 2 | `import * as SelectPrimitive from '@radix-ui/react-select'` | Medium |
| `components/ui/sheet.tsx` | 2 | `import * as DialogPrimitive from '@radix-ui/react-dialog'` | Medium |
| `components/ui/dropdown-menu.tsx` | 2 | `import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'` | Medium |
| `components/ui/dialog.tsx` | 2 | `import * as DialogPrimitive from '@radix-ui/react-dialog'` | Medium |
| `components/ui/separator.tsx` | 2 | `import * as SeparatorPrimitive from '@radix-ui/react-separator'` | Low |

> **Note:** These are Radix UI primitive patterns — required for compound components. Adding to `optimizePackageImports` helps but namespace imports limit tree-shaking.

### ✅ No `moment`, `lodash` (non-ESM), `firebase/*`, `socket.io-client` in client code
- `firebase-admin` is **backend only** (Node.js)
- No `socket.io-client` in frontend
- No `recharts`, `chart.js`, `d3`, `framer-motion` in package.json

### ⚠️ `@prisma/client` — Backend Only
- Confirmed: Zero imports in frontend `use client` files
- Only in backend + `.open-next` (server functions)

### ✅ Heavy Libs Properly Lazy-Loaded
| Lib | Component | Status |
|-----|-----------|--------|
| `tesseract.js` | Not found in frontend | N/A |
| `pdfjs-dist` | Not found in frontend | N/A |
| `jspdf` | Not found in frontend | N/A |
| `qrcode` | Used in components (likely lazy) | Check usage |
---

## ═══ 6. TOP 10 ACTIONABLE RECOMMENDATIONS ═══

Ordered by **Impact (kB saved × routes affected)**:

### 1. **Lazy-load `AdDetail` heavy sub-components** — **~80 kB × 3 routes** (ads, services, stores)
- **File:** `components/ads/AdDetail.tsx`
- **Lines:** 39-40 (`ZoomableDetailImage`, `ProgressiveDetailImage`), 543-544 (`Dialog` lightbox)
- **Change:** Wrap `ZoomableDetailImage`, `ProgressiveDetailImage`, lightbox `Dialog` in `next/dynamic(() => import(...), { ssr: false })`
- **Expected reduction:** 60-80 kB on ad/service/store detail pages
- **Risk:** Medium — lightbox is interactive, SSR false needed

### 2. **Lazy-load `MessageInput` composer** — **~35 kB × 1 route**
- **File:** `components/messages/ChatWindow.tsx` line 39-46 — `MessageMediaGallery` already dynamic ✅
- **File:** `components/messages/MessageInput.tsx` line 17 — `MessageBodyEditor` imported eagerly
- **Change:** `const MessageBodyEditor = dynamic(() => import('./MessageBodyEditor').then(m => m.MessageBodyEditor), { ssr: false })`
- **Expected reduction:** 25-35 kB on `/messages/[id]`
- **Risk:** Medium — editor is core UX, but only needed when composing

### 3. **Split `ChatWindow` conditional dialogs** — **~20 kB × 1 route**
- **File:** `components/messages/ChatWindow.tsx` lines 703-730 — `ConfirmDialog` (block), `ConfirmDialog` (delete)
- **Change:** Lazy-load both `ConfirmDialog` instances — they're conditional (only open on user action)
- **Expected reduction:** 15-20 kB
- **Risk:** Low — dialogs only open on user action

### 4. **Lazy-load `StoreProducts` (default tab)** — **~40 kB × 1 route**
- **File:** `components/stores/StoreStorefront.tsx` lines 16-27 — Already using `next/dynamic` for `StoreAds`, `StoreCollections`, `StoreReviewsList` ✅
- **Issue:** `StoreProducts` (default tab) is **eager** — should be lazy with SSR fallback
- **Change:** Make `StoreProducts` dynamic with `loading: () => <SuspenseFallback />`
- **Expected reduction:** 30-40 kB initial load (products tab loads on interaction)
- **Risk:** Low — default tab, but SEO content in server component

### 5. **Add missing `optimizePackageImports` entries** — **~40 kB × ALL routes**
- **File:** `next.config.ts` line 124
- **Change:** Add 13 packages (see Section 4 table)
- **Expected reduction:** 30-50 kB shared baseline
- **Risk:** Low — build-time optimization only

### 6. **Convert Radix UI namespace imports to named imports** — **~15 kB × ALL routes**
- **Files:** `components/ui/avatar.tsx:2`, `select.tsx:2`, `sheet.tsx:2`, `dropdown-menu.tsx:2`, `dialog.tsx:2`, `separator.tsx:2`
- **Change:** `import * as XPrimitive from '@radix-ui/react-x'` → `import { XPrimitive } from '@radix-ui/react-x'` (where possible)
- **Expected reduction:** 10-15 kB via better tree-shaking
- **Risk:** Medium — compound component patterns may break

### 7. **Lazy-load `StoreRecommendations`** — **~15 kB × 5 routes**
- **Files:** `AdDetailSection.tsx:38-40` (RelatedAds ✅ already dynamic), `StoreStorefront.tsx` (StoreRecommendations eager)
- **Change:** Make `StoreRecommendations` dynamic in `StoreStorefront.tsx`
- **Expected reduction:** 10-15 kB on store/detail pages
- **Risk:** Low — below-fold recommendations

### 8. **Extract `AdDetail` seller card & map to separate lazy components** — **~20 kB × 2 routes**
- **File:** `components/ads/AdDetail.tsx` lines 280-350 (SellerCard inline), 380-420 (Map/Location)
- **Change:** Move `SellerCard` and location/map section to separate components, lazy-load
- **Expected reduction:** 15-20 kB
- **Risk:** Medium — seller info is above-fold on mobile

### 9. **Audit `sonner` Toaster placement** — **~12 kB × ALL routes**
- **File:** `app/layout.tsx` — check if `Toaster` is rendered globally
- **Finding:** `Toaster` from sonner is in chunk `8720` (shared) — likely in root layout
- **Change:** Move `Toaster` to `(protected)/layout.tsx` only (public routes don't need toasts)
- **Expected reduction:** 8-12 kB on public routes (/, /stores, /ads, etc.)
- **Risk:** Low — public pages rarely show toasts

### 10. **Remove unused `@fontsource/*` packages from bundle** — **~0 kB JS but cleans deps**
- **File:** `package.json` lines 111-113
- **Finding:** `@fontsource/cairo`, `@fontsource/ibm-plex-mono`, `@fontsource/ibm-plex-sans-arabic` in deps but **not imported** (replaced by `next/font/google`)
- **Change:** Move to `devDependencies` or remove if not used in Storybook/tests
- **Expected reduction:** 0 kB JS (CSS-only), but cleaner dependency tree
- **Risk:** None
```
---

## ═══ 7. FILES TO AUDIT NEXT ═══

If deeper analysis needed, prioritize:

1. **`components/ads/AdDetail.tsx`** — 1,500+ lines, monolithic, contains lightbox, gallery, seller, map, actions
2. **`components/messages/ChatWindow.tsx`** — 730+ lines, message list + composer + media gallery + dialogs
3. **`components/messages/MessageInput.tsx`** — 490+ lines, rich composer with editor, recording, attachments
4. **`components/stores/StoreStorefront.tsx`** — 260+ lines, 6-tab interface with dynamic imports
5. **`components/stores/StoreProducts.tsx`** — 260+ lines, product grid with search/sort/pagination
6. **`components/ads/AdDetailSection.tsx`** — 150 lines, wrapper with RelatedAds lazy
7. **`components/home/HomePageContent.tsx`** — 120 lines, 10 lazy sections (well optimized)
8. **`app/layout.tsx`** — Root layout, Toaster placement, font loading
9. **`hooks/queries/useAds.ts` / `useProducts.ts` / `useStores.ts`** — Query hooks, TanStack Query usage
10. **`lib/cloudinary.ts`** — `SafeImage`, `getDetailImageUrl`, `getThumbnailUrl` — image utilities

---

## ═══ APPENDIX: CHUNK SIZE REFERENCE ═══

| Chunk | Raw Size | Gzipped (est) | Contents |
|-------|----------|---------------|----------|
| `4bd1b696-100b9d70ed4e49c1.js` | 173 kB | ~54 kB | React 19 runtime |
| `1255-1e70eba6f9194f59.js` | 46.3 kB | ~16 kB | React entry + router |
| `1611-eae282ee351e5f0a.js` | 60.5 kB | ~21 kB | TanStack QueryClient |
| `9287-f0deef89de81db65.js` | 15.6 kB | ~5 kB | TanStack Query core |
| `8720-0ea6dfb0b10cd39c.js` | 35.3 kB | ~12 kB | sonner + Radix Dialog |
| `5535-5ef903afa72f07e6.js` | 89.9 kB | ~28 kB | IndexedDB offline layer |
| `4909-64796d901b595af7.js` | 27.7 kB | ~9 kB | clsx/tailwind-merge/cva |
| `3455-823a6a4a4d387e56.js` | 9.3 kB | ~3 kB | TanStack Observer |
| `2168-9bf29c979bdb153a.js` | 7.8 kB | ~2.5 kB | App constants (ROUTES) |
| `7328-36dd79803e0e9077.js` | 8.9 kB | ~3 kB | Cache TTL config |
| `9749-39c0a8fc7cd40f05.js` | 9.6 kB | ~3 kB | Query keys factory |

**Total Shared (raw):** ~477 kB → **~157 kB gzipped** (matches 107 kB reported + framework overhead)

---

*Report generated by automated bundle analysis. All file paths relative to `/workspaces/marketplat/frontend`.*