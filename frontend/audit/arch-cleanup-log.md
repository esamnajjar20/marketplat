# Arch Cleanup Log — Priority 6

## Task A: Convert unnecessary "use client" files

### Converted (committed)
| File | Commit | Reason |
|------|--------|--------|
| `components/search/FacetCountBadge.tsx` | `c5192e18 refactor(rsc): make FacetCountBadge a Server Component` | Purely presentational: no hooks, no event handlers, no browser APIs. `type-check` passed. |

### Skipped (read & evaluated — retains `use client`)
| File | Reason |
|------|--------|
| `components/categories/CategoriesIndex.tsx` | Uses `useCategoryItems` hook |
| `components/categories/CategoryFollowButton.tsx` | Uses `useFollowStatus`, `useToggleFollow`, `useAuthStore` hooks + `onClick` |
| `components/search/EmptySearchAlternatives.tsx` | Uses `useAds` hook |
| `components/search/EmptySearchSuggestions.tsx` | Uses `useEffect`, `useState`, `useSearchParams`, `useCategories`, `useAuthStore` hooks |
| `components/search/SearchTabs.tsx` | Uses `useId`, `useRef`, `onClick`, `onKeyDown` |
| `components/search/SearchSortBarWrapper.tsx` | Uses `useSearchParams` |
| `components/search/QuickFiltersBar.tsx` | Uses `useCallback`, `useRouter`, `useSearchParams`, `onClick`, `hapticQuickFilter` |
| `components/search/SearchViewToggle.tsx` | Uses `onClick` |
| `components/search/SearchActiveFilters.tsx` | Uses `useRouter`, `useSearchParams`, `onClick` |
| `components/stores/ProductCard.tsx` | Uses `useNowAfterMount` hook |
| `components/stores/StoreHeader.tsx` | Uses `useRouter`, `useAuthStore`, `useToggleStoreFollow`, `useIsFollowingStore` hooks |
| `components/stores/MyStoreCard.tsx` | Uses `useRef`, `useState`, mutation hooks |
| `components/stores/StoresFilters.tsx` | Uses `useRouter`, `useSearchParams`, `onKeyDown`, `onBlur` |
| `components/stores/StoresFiltersSheet.tsx` | Uses `useState`, `useSearchParams`, `onClick` |
| `components/stores/ProductDetailSection.tsx` | Uses `useEffect`, `useProduct`, `useProducts` hooks + `onClick` |
| `components/stores/ProductsGrid.tsx` | Uses `useSearchParams`, `useInfiniteQuery`, `useOnlineStatus`, `useNetworkPolicy` hooks |
| `components/admin/AdminAuditLogRow.tsx` | Uses `onClick`, `onKeyDown`, `ref` callback |
| `components/admin/AdminStoreRow.tsx` | Uses `onChange`, `onClick` |
| `components/admin/AdminUserRow.tsx` | Uses `onChange`, `onClick`, `onSelect` |
| `components/admin/AdminAdRow.tsx` | Uses `onChange`, `onClick` |
| `components/admin/AdminFraudRow.tsx` | Uses `onClick` |
| `components/admin/AdminSellerRow.tsx` | Uses `onClick` |
| `components/admin/AdminProductRow.tsx` | Uses `onClick` |
| `components/admin/AdminServiceListingRow.tsx` | Uses `onClick` |
| `components/admin/AdminProductCategoriesTree.tsx` | Passes data/mutation hooks into `AdminEntityCategoriesTree` |
| `components/admin/AdminServiceCategoriesTree.tsx` | Passes data/mutation hooks into `AdminEntityCategoriesTree` |
| `components/admin/AdminCategoriesTree.tsx` | Uses `useState`, `useCategoriesForAdmin`, `useDeleteCategory`, `onClick` |
| `components/admin/AdminEntityCategoriesTree.tsx` | Uses `useState`, data/mutation hooks, `onClick` |
| `components/admin/AdminFilterBar.tsx` | Uses `useCallback`, `useEffect`, `useState`, `useRouter`, `usePathname`, `useSearchParams`, `onClick`, `onChange` |
| `components/admin/AdminTabsHub.tsx` | Uses `useEffect`, `useRouter`, `useSearchParams`, `useAuthStore`, `next/dynamic` |
| `components/admin/CreateCategoryButton.tsx` | Uses `useState`, `useCreateCategory`, `useResettableDialog`, `onClick`, `onChange` |
| `components/admin/EditCategoryButton.tsx` | Uses `useState`, `useUpdateCategory`, `useResettableDialog`, `onClick`, `onChange` |
| `components/admin/AdminDeveloperToolsControl.tsx` | Uses `useEffect`, `useState`, `useAuthStore`, `window.dispatchEvent`, `onClick` |
| `components/admin/AdSignalsPanel.tsx` | Uses `useAdminFraudSignals`, `useAdminReviewFraudSignal` hooks + `onClick` |
| `components/admin/AdminExportButton.tsx` | Uses `useState`, `URL.createObjectURL`, `document.createElement`, `window.setTimeout`, `onClick` |
| `components/admin/AdminStatsGrid.tsx` | Uses `useAdminStats` hook |
| `components/admin/AdminRecentActivity.tsx` | Uses `useAdminAds` hook |
| `components/admin/BroadcastNotificationButton.tsx` | Uses `useState`, `useAdminBroadcastNotification`, `onClick`, `onChange` |

## Task B: Split large presentational components (>500 lines)

### Top 5 by line count (from `find components app -name "*.tsx" -exec wc -l`)
| # | File | Lines | Verdict |
|---|------|-------|---------|
| 1 | `components/stores/ProductForm.tsx` | 859 | SKIP — interactive form (`useState`, `useEffect`, `useRef`, `useSearchParams`, `useRouter`, `onChange`, `window.history`) |
| 2 | `components/services/ServiceListingForm.tsx` | 812 | SKIP — interactive form (`useState`, `useEffect`, `useRef`, `useSearchParams`, `useRouter`, `onChange`, `window.scrollTo`, `onSubmit`) |
| 3 | `components/settings/SyncCenterClient.tsx` | 787 | SKIP — interactive (`useState`, `useCallback`, `useEffect`, `useMemo`, `window.addEventListener`, `window.clearTimeout`) |
| 4 | `components/ads/AdForm.tsx` | 773 | SKIP — interactive form (`useState`, `useEffect`, `useRef`, `useSearchParams`, `useRouter`, `onChange`, `window.history`) |
| 5 | `components/settings/OfflineRoutesList.tsx` | 769 | SKIP — interactive (`useState`, `useCallback`, `useEffect`, `useRef`, `useMemo`, `window.setInterval`) |

### Decision
None of the top 5 are purely presentational — every one reads hooks, browser APIs, or event handlers, so extracting sub-components would not be a safe presentational-only split and could break interactivity. All 5 documented as "requires interactive split". No files split in this session.

## Task C: Fix barrel imports

### Search results
- `grep -rn "from '@/components/shared/ui." components app --include="*.tsx"` → returns direct file imports only (`ui/Button`, `ui/Input`, `ui/Skeleton`, `ui/Select`, `ui/Checkbox`, `ui/Tooltip`, `ui/Pagination`, `ui/Dialog`, ...). None import from the `@/components/shared/ui` barrel index.
- `grep -rn "from '@/components/shared/skeletons." components app --include="*.tsx"` → returns direct file imports only (`skeletons/TableSkeleton`, `skeletons/AdCardSkeleton`, ...). None import from the `@/components/shared/skeletons` barrel index.
- Direct barrel-index probe `from '@/components/shared/ui'` and `from '@/components/shared/skeletons'` → **zero matches** anywhere in `components` or `app`.

### Barrel files that exist (but are unused as imports)
- `components/shared/ui/index.ts` — re-exports Avatar, Badge, Button, Card, Input, Skeleton, Spinner, StatusBadge, ...
- `components/shared/skeletons/index.ts` — re-exports the skeleton components

### Decision
No barrel imports found. Every import from `@/components/shared/ui` and `@/components/shared/skeletons` already targets the specific file path, so there is nothing to convert. Task C: **0 files fixed**, 0 commits.


