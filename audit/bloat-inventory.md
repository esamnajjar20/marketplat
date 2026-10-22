# Frontend bundle-bloat inventory

Repository-wide source/package scan completed 2026-10-22. Route impacts below
are measured First Load JS changes from `audit/rsc-baseline.md` and recent
production builds where available; other estimates are qualitative because a
source scan alone cannot reliably attribute shared/chunked bytes.

| Cause | Type | Files Affected | Est. Impact (kB) | Priority |
|---|---|---|---:|---|
| Client dependency graph and tab panels statically imported together | Route chunks | `components/admin/AdminTabsHub.tsx`; `components/settings/SettingsTabsHub.tsx`; `components/stores/MyStoreTabsHub.tsx`; `components/services/MyServicesTabsHub.tsx`; `components/profile/ActivityTabsHub.tsx` | Measured reductions: `/admin` -206, `/settings` -168, `/my-store` -94, `/my-services` -167, `/activity` -139 | Resolved |
| Saved search management client module loaded by route shell | Route chunk | `app/(protected)/saved-searches/page.tsx` → `components/profile/SavedSearchesList.tsx` | Not measured under no-build directive | Improved; pending measurement |
| Interactive request-creation form loaded with route wrapper | Route chunk | `app/(protected)/requests/new/page.tsx` → `components/requests/CreateRequestForm.tsx` | Not measured under no-build directive | Improved; pending measurement |
| Interactive request-offers manager loaded with route wrapper | Route chunk | `app/(protected)/requests/offers/page.tsx` → `components/requests/MyRequestOffersPageClient.tsx` | Not measured under no-build directive | Improved; pending measurement |
| Interactive my-requests list loaded with route wrapper | Route chunk | `app/(protected)/requests/me/page.tsx` → `components/requests/MyRequestsPageClient.tsx` | Not measured under no-build directive | Improved; pending measurement |
| Public profile tab panels bundled with profile section | Route chunk | `components/profile/ProfileTabsSection.tsx` | Not measured under no-build directive | Improved; pending measurement |
| Customer management UI loaded with account route wrapper | Route chunk | `app/(protected)/account/customers/page.tsx` → `components/sales/CustomersPageClient.tsx` | Not measured under no-build directive | Improved; pending measurement |
| Debt and installment screens loaded with account route wrappers | Route chunks | `app/(protected)/account/sales/{debts,installments}/page.tsx` → `components/sales/{DebtsPageClient,InstallmentsPageClient}.tsx` | Not measured under no-build directive | Improved; pending measurement |
| Following list statically loaded by route and story overlays loaded eagerly | Route chunks | `app/(protected)/following/page.tsx`; `app/(protected)/stories/page.tsx` | Not measured under no-build directive | Improved; pending measurement |
| Heavy edit forms statically loaded with protected edit routes | Route chunks | `my-ads/[id]/edit`, `my-services/[id]/edit`, `my-store/products/[id]/edit` route pages | Not measured under no-build directive | Improved; pending measurement |
| Client-only Axios transport used by interactive features | Shared/client graph | `api/client.ts`, `api/*.api.ts`, query/mutation hooks; notably `components/messages/MessageInput.tsx` | Not separately attributable; `/messages/[id]` remains 278 kB | Accepted debt for offline-critical composer |
| Heavy general-purpose libraries (Moment, Lodash, Recharts, Chart.js, Tiptap, Quill) | Dependency/source scan | `frontend/package.json`, application imports | 0 direct application imports found | None |
| Heavy optional modules | Deferred client modules | `components/map/SearchResultsMap.tsx` / `SearchResultsMapInner.tsx` (`leaflet`, `react-leaflet`); `components/debug/ErudaDebug.tsx` (`eruda`); `components/admin/AdminAnalyticsDashboard.tsx` (already dynamically loaded) | Route-specific; map/debug/dashboard already isolated or conditionally loaded | Low / monitor |
| Static component barrels | Tree-shaking | `components/shared/skeletons/index.ts`, `components/shared/ui/index.ts`, `lib/i18n/ar/index.ts`, `lib/offline/index.ts`, `lib/runtime/index.ts` | No `shared/ui` barrel consumers found; skeleton barrel has 21 application consumers. No demonstrated measurable bloat | Low |
| Client route entry points | RSC boundaries | 18 `page.tsx`/`layout.tsx` files directly declare `"use client"` (including update, requests, stores, account and auth routes) | Route-dependent; not safely attributable from scan | High, incremental |
| Large client modules (over ~300 source lines) | Component scope | `ChatWindow`, `MessageInput`, `SyncCenterClient`, `ProductForm`, `AdForm`, `ServiceListingForm`, `AdminMonitoringCenter`, `AdminUsersTable`, `MyStoreInventory`, and other forms/offline modules | Varies by rendered route; chat route measured 278 kB | High, split by feature |
| Raw `<img>` tags | Image delivery | 18 raw image call sites across settings, forms, messages, receipt, catalog download and previews | Primarily image/network performance, not JS; some usages require blob/local previews | Medium |
| Font delivery | Font assets | `app/layout.tsx`, `components/shared/DeferredFonts.tsx` | Local `@fontsource` files; extra weights load on demand | Resolved / monitor |
| Third-party script loading | Script execution | `app/layout.tsx` contains only development hydration tracing, JSON-LD scripts and project-owned components; no external analytics/chat scripts found | 0 external synchronous scripts found | None |
| Duplicate heavy package versions | Dependency graph | `frontend/package.json` / lockfile | `npm ls` found one Axios version and no installed Moment/Lodash/chart/editor matches | None |
| Root provider work | App shell | `providers/AppProviders.tsx`, `app/layout.tsx` | React Query, auth hydration, PWA/offline listeners, toasts, analytics consent, presence and navigation are app-wide; devtools are already development-only dynamic | Medium; reliability-sensitive |

## Actions completed in this campaign

- Admin, settings, my-store, activity, favorites, and public store detail
  tab/panel chunks were split with `next/dynamic`. The offline warming
  manifest explicitly includes the dynamic modules used by those routes.
- `/admin`: First Load JS 340 → 134 kB.
- `/settings`: 295 → 127 kB.
- `/my-store`: 309 → 215 kB.
- `/activity`: 269 → 130 kB.
- `/favorites`: 278 → 272 kB.
- `/stores/[id]`: 323 → 320 kB.
- `/messages/[id]`: media gallery is lazy-loaded; route remains 278 kB.
- `/notifications`: repeated notification rows are lazy-loaded; 238 → 236 kB.
- `/my-services`: provider-workspace tabs are lazy-loaded; 297 → 130 kB.
- `/saved-searches`: saved-search manager is loaded as a route-level client
  chunk; First Load JS measurement is deferred to the final verification build.
- `/requests/new`: request-creation form is isolated behind a dynamic client
  chunk; First Load JS measurement is deferred to final verification.
- `/requests/offers`: interactive offers manager is isolated behind a dynamic
  client chunk; First Load JS measurement is deferred to final verification.
- `/requests/me`: interactive requests list is isolated behind a dynamic client
  chunk; First Load JS measurement is deferred to final verification.
- `/profile/[id]`: profile ads, store, services, and rating panels load as
  dynamic chunks; First Load JS measurement is deferred to final verification.
- `/account/customers`: customer-management UI is isolated behind a dynamic
  client chunk; First Load JS measurement is deferred to final verification.
- `/account/sales/debts` and `/account/sales/installments`: interactive screens
  are isolated behind dynamic chunks; measurements are deferred to final
  verification.
- `/following` dynamically loads its list; `/stories` loads its composer and
  viewer only when opened. Bundle measurements are deferred to final
  verification.
- Protected ad, service, and product edit routes dynamically load their
  forms after data/ownership resolution; measurements are deferred to final
  verification.

## Remaining / blocked

- `MessageInput` is **ACCEPTED TECH DEBT**: its message/file/image/audio flows
  rely on the Axios interceptors for CSRF, stable operation IDs, and the
  service-worker 202/offline-queue contract. Replacing transport without
  reproducing that contract is not a safe bundle-only change.
- Notifications retain the interactive page/query architecture; only
  `NotificationRow` is split into a lazy client chunk, which is included in
  the `/notifications` offline warming assets.
- Catalog routes (`/products`, `/stores`, `/services`, `/search`) had previous
  server-pagination experiments that materially increased route JS and were
  reverted. Revisit only with a smaller client rendering boundary.
- Raw image tags need call-site review; blob/data previews and generated
  catalog images are not mechanically replaceable with `next/image`.
- The full unit suite had pre-existing failures in service-worker, API-client,
  offline queue/cache, `MyProductsList`, and `ConversationList` suites during
  this session. Focused tests are recorded in `audit/rsc-report.md`.
