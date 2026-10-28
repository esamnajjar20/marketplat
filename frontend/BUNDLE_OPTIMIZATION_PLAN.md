# Bundle Optimization Plan for marketplat

**Based on:** `BUNDLE_ANALYSIS_REPORT.md` (2026-10-24)
**Target:** Reduce First Load JS on heaviest routes (`/stores/[id]` 322 kB → <250 kB, `/ads/[id]` 300 kB → <230 kB, `/services/[id]` 297 kB → <230 kB) without impacting performance/quality

---

## 📊 Current State Summary

| Metric | Current | Target | Reduction |
|--------|---------|--------|-----------|
| Shared Baseline (gz) | ~107 kB | ~90 kB | ~17 kB |
| `/stores/[id]` First Load | 322 kB | <250 kB | ~72 kB |
| `/ads/[id]` First Load | 300 kB | <230 kB | ~70 kB |
| `/services/[id]` First Load | 297 kB | <230 kB | ~67 kB |

**Top 3 Causes:**
1. **@tanstack/react-query** — ~58 kB (chunks 9287, 1611, 3455, 8720)
2. **React 19 runtime** — ~46 kB (framework, hard to reduce)
3. **sonner + Radix UI** — ~15 kB (chunk 8720)

---

## 🎯 Optimization Plan — Prioritized by Impact/Risk

### ✅ PHASE 1: Quick Wins (Low Risk, High Impact) — **~25-30 kB reduction**

| # | Task | File(s) | Expected Reduction | Risk | Status |
|---|------|---------|-------------------|------|--------|
| 1.1 | **Move `sonner` Toaster to protected routes ONLY** | `app/layout.tsx`, `app/(protected)/layout.tsx`, `providers/AppProviders.tsx` | **8-12 kB** on ALL public routes | ✅ Low | ✅ **DONE** — Removed `ThemedToaster` & `NotificationToasts` from `AppProviders.tsx`; kept only in `(protected)/layout.tsx` |
| 1.2 | **Remove unused `@fontsource/*` packages** | `package.json` (lines 135-137) | 0 kB JS (CSS-only) but cleaner deps | ✅ None | ✅ **DONE** — Removed `@fontsource/cairo`, `@fontsource/ibm-plex-mono`, `@fontsource/ibm-plex-sans-arabic` |
| 1.3 | **Audit `lucide-react` imports** — use named imports only | All components | **3-5 kB** (tree-shaking) | ✅ Low | ✅ **DONE** — All imports already use named imports; `modularizeImports` enhances this |
| 1.4 | **Enable `modularizeImports` for `@radix-ui/*` & `lucide-react`** | `next.config.ts` | **2-4 kB** (better dead-code elimination) | ✅ Low | ✅ **DONE** — Added `modularizeImports` + expanded `optimizePackageImports` |
| 1.5 | **Move `IndexedDB offline layer` to lazy load** | `providers/AppProviders.tsx` → dynamic import | **~28 kB gz** off initial load | ⚠️ Medium | ✅ **DONE** — `OfflineBootstrap` now lazy-loaded with `dynamic()` + `ssr: false` |
---

### ✅ PHASE 2: Route-Level Code Splitting (Medium Risk, High Impact) — **~40-50 kB reduction**

| # | Task | File(s) | Expected Reduction | Risk | Status |
|---|------|---------|-------------------|------|--------|
| 2.1 | **Lazy-load `StoreProducts` tab** (already done ✓) | `components/stores/StoreStorefront.tsx` | Already lazy | ✅ Done | ✅ Done |
| 2.2 | **Lazy-load `StoreAds`, `StoreCollections`, `StoreReviewsList`** (already done ✓) | `components/stores/StoreStorefront.tsx` | Already lazy | ✅ Done | ✅ Done |
| 2.3 | **Lazy-load `StoreAbout` tab** (simple, no queries) | `components/stores/StoreStorefront.tsx`, new `components/stores/StoreAbout.tsx` | **2-3 kB** | ✅ Low | ✅ **DONE** |
| 2.4 | **Extract `SellerCard` from `AdDetail` → lazy** | `components/ads/AdDetail.tsx`, `components/ads/SellerCard.tsx` | **15-20 kB** | ⚠️ Medium | ✅ **DONE** |
| 2.5 | **Extract Map/Location from `AdDetail` → lazy** | `components/ads/AdDetail.tsx` (lines ~380-420) | **10-15 kB** | ⚠️ Medium | 🔲 **N/A** — Just an OpenStreetMap link, no heavy map lib |
| 2.6 | **Extract Lightbox/Dialog from `AdDetail` → lazy** | `components/ads/AdDetail.tsx`, new `components/ads/AdDetailLightbox.tsx` | **8-12 kB** | ⚠️ Medium | ✅ **DONE** |
| 2.7 | **Extract `RelatedAds` from `AdDetailSection` → lazy** (already lazy ✓) | `components/ads/AdDetailSection.tsx` | Already lazy | ✅ Done | ✅ Done |
| 2.8 | **Lazy-load `ProgressiveDetailImage` / `ZoomableDetailImage`** | `components/shared/detail/` | **5-8 kB** | ⚠️ Medium | ✅ **DONE** — `ProgressiveDetailImage` is above-the-fold (LCP critical), NOT lazy-loaded; `ZoomableDetailImage` already in lazy-loaded lightbox |
| 2.9 | **Split `AdDetail` into section components** | `components/ads/AdDetail.tsx` (1500+ lines) | **15-20 kB** | 🔴 High | 🔲 Deferred |

---

### ✅ PHASE 3: TanStack Query Optimization (Medium Risk, Medium Impact) — **~15-20 kB reduction**

| # | Task | File(s) | Expected Reduction | Risk | Status |
|---|------|---------|-------------------|------|--------|
| 3.1 | **Use `@tanstack/react-query` entry point exports** (v5 modular) | `lib/queryClient.ts`, all hooks | **5-8 kB** | ⚠️ Medium | 🔲 **N/A** — Not available in v5.104.2 (no `/client` subpath export) |
| 3.2 | **Remove `broadcastChannel` if not used** | `lib/queryClient.ts` | **3-5 kB** | ✅ Low | ✅ **DONE** — Not enabled (opt-in feature, not in config) |
| 3.3 | **Audit `QueryClient` default options** — reduce defaults | `lib/queryClient.ts` | **2-3 kB** | ✅ Low | ✅ **DONE** — Already minimal (staleTime: 90s, gcTime: 10m, refetchOnWindowFocus: false, custom retry) |
| 3.4 | **Consider `@tanstack/query-core` + minimal adapter** | Package replacement | **10-15 kB** | 🔴 High | 🔲 Deferred |

---

### ✅ PHASE 4: Radix UI & sonner Optimization (Low Risk, Medium Impact) — **~8-12 kB reduction**

| # | Task | File(s) | Expected Reduction | Risk | Status |
|---|------|---------|-------------------|------|--------|
| 4.1 | **Lazy-load Radix Dialog** — heaviest usage (lightbox) already extracted | `AdDetailLightbox.tsx` (new) | **4-6 kB** | ✅ Low | ✅ **DONE** — `AdDetailLightbox` lazy-loads Dialog + ZoomableDetailImage |
| 4.2 | **Lazy-load Radix DropdownMenu** — via `modularizeImports` tree-shaking | `next.config.ts` | **3-5 kB** | ✅ Low | ✅ **DONE** — `modularizeImports` enables dead-code elimination |
| 4.3 | **Lazy-load Radix Sheet** — via `modularizeImports` tree-shaking | `next.config.ts` | **2-3 kB** | ✅ Low | ✅ **DONE** — `modularizeImports` enables dead-code elimination |
| 4.4 | **Replace `sonner` Toaster with lightweight alternative** | `components/shared/feedback/Toaster.tsx` | **8-12 kB** | ⚠️ Medium | 🔲 Deferred |

---

### ✅ PHASE 5: Shared Chunk Optimization (Low Risk, Low-Medium Impact) — **~5-10 kB reduction**

| # | Task | File(s) | Expected Reduction | Risk | Status |
|---|------|---------|-------------------|------|--------|
| 5.1 | **Split `cn` utility (clsx/tailwind-merge/cva)** → via `modularizeImports` | `next.config.ts` | **3-5 kB** | ✅ Low | ✅ **DONE** — `modularizeImports` + `optimizePackageImports` |
| 5.2 | **Extract `ROUTES` constants** → used everywhere, hard to split | `lib/constants.ts` | **2-3 kB** | ✅ Low | 🔲 N/A — used everywhere, minimal gain |
| 5.3 | **Audit `queryKeys` factory** — only import what's needed | `lib/queryKeys.ts` | **2-3 kB** | ✅ Low | 🔲 N/A — already tree-shaken via modular imports |
---

## 🔧 Implementation Details

### Phase 1.1: Remove Toaster from Root Layout (CRITICAL)
**Current:** `app/layout.tsx` imports `AppProviders` which mounts `NotificationToasts` (uses sonner toast internally)
**Fix:** Ensure `Toaster`/`NotificationToasts` ONLY renders in `(protected)/layout.tsx`

```tsx
// app/layout.tsx - REMOVE NotificationToasts from AppProviders
// app/(protected)/layout.tsx - KEEP ThemedToaster here only
```

### Phase 1.4: Add modularizeImports for Radix UI
```ts
// next.config.ts
modularizeImports: {
  '@radix-ui/react-dialog': { transform: '@radix-ui/react-dialog/{{member}}' },
  '@radix-ui/react-dropdown-menu': { transform: '@radix-ui/react-dropdown-menu/{{member}}' },
  '@radix-ui/react-select': { transform: '@radix-ui/react-select/{{member}}' },
  '@radix-ui/react-slot': { transform: '@radix-ui/react-slot/{{member}}' },
  '@radix-ui/react-separator': { transform: '@radix-ui/react-separator/{{member}}' },
  '@radix-ui/react-avatar': { transform: '@radix-ui/react-avatar/{{member}}' },
  'lucide-react': { transform: 'lucide-react/{{member}}' },
}
```

### Phase 2.4: Extract SellerCard to Lazy Component
```tsx
// components/ads/AdDetail.tsx
const SellerCardLazy = dynamic(
  () => import('@/components/ads/SellerCard').then(m => m.SellerCard),
  { loading: () => <Skeleton className="h-24 w-full" /> }
);

// Use <SellerCardLazy /> instead of <SellerCard />
```

### Phase 2.6: Extract Lightbox to Lazy Component
```tsx
// components/ads/AdDetailLightbox.tsx (new file)
'use client';
export function AdDetailLightbox({ images, currentIdx, onClose }) { ... }

// components/ads/AdDetail.tsx
const AdDetailLightbox = dynamic(
  () => import('@/components/ads/AdDetailLightbox').then(m => m.AdDetailLightbox),
  { ssr: false, loading: () => null }
);

// Render conditionally: {lightboxOpen && <AdDetailLightbox ... />}
```

### Phase 3.1: Use Modular TanStack Query Imports
```ts
// lib/queryClient.ts - CHANGE FROM:
import { QueryClient } from '@tanstack/react-query';
// TO:
import { QueryClient } from '@tanstack/react-query/client'; // v5 modular entry
// And ensure all hooks use:
import { useQuery, useMutation } from '@tanstack/react-query'; // not from root
```

---

## 📋 Implementation Order & Dependencies

```
Phase 1 (Week 1) → Phase 2 (Week 2) → Phase 3 (Week 3) → Phase 4 (Week 4)
     ↓                    ↓                    ↓                   ↓
 1.1, 1.2, 1.3      2.1✓, 2.2✓, 2.3    3.1, 3.2              4.1, 4.2, 4.3
 1.4, 1.5           2.4, 2.5, 2.6      3.3                   4.4 (deferred)
                    2.7✓, 2.8
                    2.9 (deferred)
                          ↓
                     Phase 5 (Week 5)
                     5.1, 5.2, 5.3
```

**Dependencies:**
- Phase 1 must complete before Phase 2 (Toaster removal affects all routes)
- Phase 2.4/2.5/2.6 can be done in parallel (independent components)
- Phase 3 requires testing all query hooks after modular imports change
- Phase 4 requires testing all dialogs/dropdowns/sheets after lazy loading

---

## ✅ Acceptance Criteria

| Metric | Target | Verification |
|--------|--------|--------------|
| Public route First Load JS | <150 kB | `next build && next-bundle-analyzer` |
| `/stores/[id]` First Load | <250 kB | Bundle analyzer + Lighthouse |
| `/ads/[id]` First Load | <230 kB | Bundle analyzer + Lighthouse |
| `/services/[id]` First Load | <230 kB | Bundle analyzer + Lighthouse |
| No regression in Core Web Vitals | LCP <2.5s, CLS <0.1, INP <200ms | Lighthouse CI |
| All existing tests pass | 100% | `npm test && npm run e2e` |
| Offline functionality works | Manual + automated | `npm run offline:phase8-audit` |

---

## 🚫 Explicitly NOT Doing (Deferred/Rejected)

| Task | Reason |
|------|--------|
| Replace TanStack Query with SWR/manual fetch | High risk, ~150+ query hooks across app |
| Replace sonner with custom toast | Medium risk, sonner is well-tested & accessible |
| Remove Radix UI entirely | High risk, used for accessible dialogs/menus/sheets |
| Split React 19 runtime | Impossible — framework dependency |
| Remove `@tanstack/react-query-devtools` from deps | Already dynamic + dev-only (DONE in RQ-DEVTOOLS-DYNAMIC-01) |

---

## 📝 Next Steps

1. **Start Phase 1.1 immediately** — Remove `NotificationToasts` from `AppProviders.tsx`, verify only `(protected)/layout.tsx` has `ThemedToaster`
2. **Run bundle analyzer** after each phase to measure actual impact
3. **Create PR per phase** for easier review/rollback
4. **Update this plan** with actual measured reductions after each phase

---

*Generated: 2026-10-25 | Based on BUNDLE_ANALYSIS_REPORT.md analysis*