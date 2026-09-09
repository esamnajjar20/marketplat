# Marketplace Discovery Home — Changed Files

## Modified (existing files, edited in place)
- frontend/lib/constants.ts                          — added ROUTES.products
- frontend/components/shared/skeletons/index.ts       — export ProductCardSkeleton
- frontend/app/(public)/page.tsx                      — Home reassembled: Ads → Products → Nearby Providers → Stores → Recommended

## New files
- frontend/components/shared/skeletons/ProductCardSkeleton.tsx
- frontend/components/stores/ProductsGrid.tsx                    — /products browse grid
- frontend/app/(public)/products/page.tsx                        — /products page
- frontend/hooks/queries/useNearbyServiceProvidersIfGranted.ts   — silent permission-gated nearby hook
- frontend/components/home/NearbyProvidersSection.tsx            — Home section, hides unless GPS already granted
- frontend/components/home/RecentProducts.tsx                    — Home products rail
- frontend/components/home/ProductsSection.tsx                   — wrapper w/ self-hiding heading
- frontend/components/home/RecentStores.tsx                      — Home stores rail
- frontend/components/home/StoresSection.tsx                     — wrapper w/ self-hiding heading

## New tests
- frontend/__tests__/components/ProductsGrid.test.tsx
- frontend/__tests__/hooks/useNearbyServiceProvidersIfGranted.test.tsx
- frontend/__tests__/components/NearbyProvidersSection.test.tsx
- frontend/__tests__/app/HomePage.test.tsx

## Not verified
No network access in the build environment → could not run `npm install`,
`npm test`, or `npm run build`. Import paths and prop shapes were checked
manually against every dependency (Skeleton, EmptyState, Button, Pagination,
buildMetadata, ProductCard/StoreCard/ServiceProviderCard Props). Run the
three commands above before merging.

## Known gap vs plan
/stores has a full filter sidebar (StoresFilters/StoresFiltersSheet/
SearchSortBarWrapper) that /products does not replicate — URL params work,
no filter UI yet. Separate follow-up if wanted.
