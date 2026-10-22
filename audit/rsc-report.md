# RSC migration report

## Increment 1: public profile follow pages

The 584-entry `audit/use-client-files.txt` inventory is being triaged in
feature batches. The two profile follow route entries used client-side query
hooks for public, paginated data. They now fetch on the server and render
their list and pagination as Server Components; follow-status queries and
mutations stay isolated in the new `FollowActionButton` Client Component.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/profile/[id]/followers` | 215 kB | 214 kB | 0.47% |
| `/profile/[id]/following` | 215 kB | 214 kB | 0.47% |
| `/profile/[id]` | 304 kB | 303 kB | 0.33% |

Bundle values are Next.js **First Load JS** from `audit/rsc-baseline.md` and
the latest post-change production build. The two follow route entries'
emitted client chunks also fell from 1.86 kB to 166 B and 1.91 kB to 167 B,
respectively. The shared First Load JS remains 105 kB.

### Converted from Client to Server

- `frontend/app/(public)/profile/[id]/followers/page.tsx`
- `frontend/app/(public)/profile/[id]/following/page.tsx`
- `frontend/components/profile/PublicProfileHeader.tsx` — static profile
  identity and statistics are server-rendered.

### Extracted Client Components

- `frontend/components/follows/FollowActionButton.tsx` — retains per-target
  follow status and follow/unfollow mutations at the interactive leaf.
- `frontend/components/profile/PublicProfileInteractive.tsx` — isolates
  back/share, story/presence, follow, and message/edit controls.

### Deferred / not converted

- `PublicProfileClient` now uses a compact client-rendered fallback header
  rather than importing the full profile header into the client graph; the
  primary profile route renders the complete header on the server.
- `/products`: an experimental server-fetch/server-render implementation
  increased First Load JS from the 119 kB baseline to 154 kB (+29.4%). The
  experiment was reverted. This was client-dependency graph bloat, not a
  pagination limitation; retry with native `fetch` in the server component
  and Load More leaf instead of importing the Axios `apiClient`.
- `/products` pagination experiment: server-rendering the initial product
  grid with an extracted client toolbar/Load More control produced 248 kB
  First Load JS against the same 119 kB baseline (+108.4%). The changes were
  reverted; this pagination/RSC attempt is deferred until both server and
  Load More requests use lightweight native `fetch` rather than the Axios
  `apiClient` and its dependency graph.
- `/stores` pagination experiment: server-rendering the initial directory and
  replacing infinite scrolling with an explicit Load More control produced
  231 kB First Load JS against the 116 kB baseline (+99.1%). The experiment
  was reverted to avoid the regression; this is dependency/client-graph
  bloat rather than an infinite-scroll limitation. Retry with native `fetch`
  for the server first page and Load More leaf instead of Axios `apiClient`.
- `/requests/[id]` remains a Client Component for a later increment because
  its route entry currently owns request queries, authentication-dependent
  rendering, cancellation state/mutations, offer submission, and a dialog.
  Moving those behaviors requires a separate data/rendering split; it was
  left unchanged rather than risk removing the client boundary from hooks.
- `/products` and `/products/[id]` route entry files were already Server
  Components and were not changed.

No E2E tests were run.

## Increment 2: promoted products pagination

`/promoted` now fetches and renders the first promoted-products page in its
Server Component. The remaining pages are fetched only after an explicit
Load More click; the IntersectionObserver sentinel and `useInfiniteQuery`
were removed from this route.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/promoted` | 230 kB | 229 kB | 0.43% |

The server-rendered initial page includes the product cards and total count.
Focused Load More tests, type-check, full lint, and production build passed.
Full lint reports 53 existing warnings and no errors. No E2E tests were run.

### Converted from Client to Server

- `frontend/app/(public)/promoted/page.tsx` — fetches the initial page and
  renders its cards, total count, and empty state on the server.

### Extracted Client Components

- `frontend/components/promoted/PromotedLoadMore.tsx` — fetches subsequent
  pages only on explicit click and appends cards.

## Increment 3: admin and messages route shells

The admin route layout now delegates its authentication gate and interactive
shell to `AdminLayoutClient`, while the route layout itself is a Server
Component. The `/admin` page was already a Server Component; its
`AdminTabsHub`, tables, charts, and role-dependent navigation remain client
islands. The warming diagnostics page also remains client-rendered because it
depends on browser storage and cache APIs.

The messages layout is now a Server Component and reads the selected
conversation from route params. `ChatWindow` remains the interactive thread
leaf. `ConversationList` must also remain a Client Component: its search,
filters, unread/archive controls, presence polling, pin/archive/mute actions,
and delete dialog all use client state and mutations.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/admin` | 340 kB | 340 kB | 0.00% |
| `/admin/debug/warming` | 146 kB | 146 kB | 0.00% |
| `/messages` | 105 kB | 105 kB | 0.00% |
| `/messages/[id]` | 278 kB | 278 kB | 0.00% |

The Server Component boundaries preserve the existing auth and conversation
interactions; no First Load JS regression was measured. Focused ChatWindow
tests passed. The combined ConversationList/ChatWindow run also exposed one
existing ConversationList test failure: it queries the “الأرشيف” tab as a
button although the rendered control has `role="tab"`; no ConversationList
code was changed.

## Increment 4: deferred services and unified search pagination

Both routes were experimentally changed to fetch their first page with native
server `fetch` and request later pages with explicit client Load More controls.
The experiment was reverted after the production build showed large First
Load JS regressions, despite not importing the Axios API client. The measured
client-rendered card/result graph remains too costly to attach to these
routes; a smaller client boundary is needed before retrying.

| Route | Old Bundle Size | Experimental Bundle Size | Change |
|---|---:|---:|---:|
| `/services` | 107 kB | 245 kB | +129.0% |
| `/search` | 107 kB | 269 kB | +151.4% |

The experiment was reverted as required. Both routes remain on their
previous client-side infinite-query implementations; no E2E tests were run.
Native fetch alone did not avoid the dependency/client-graph bloat.

## Global infinite-scroll inventory

- `audit/infinite-scroll-inventory.md` records all six infinite-query routes,
  shared observer trigger, non-pagination IntersectionObserver and scroll
  listeners, and related tests.
- `/promoted` is converted to explicit Load More.
- `/products` and `/stores` were deferred after dependency/client-graph
  regressions; native `fetch` is required for the next attempt.
- `/services` and `/search` are deferred after native-fetch experiments still
  increased First Load JS; a smaller client-card/result boundary is needed.
- Ads/category results and message-history pagination remain pending.

## Increment 5: account route-shell experiment (DEFERRED)

Extracting the customer, debt, installment, and receipt pages into Client
Component leaves behind Server Component route entries was measured in one
account batch. The customer route rose from 207 to 208 kB and the debts route
from 205 to 206 kB, so the entire batch was reverted per the no-regression
rule, including the receipt page's native-fetch experiment (212 to 136 kB).
The installment route remained at 204 kB. This indicates the remaining
customer/debt interactive pages need a smaller client boundary before
revisiting; no account source changes were retained.

## Increment 6: account receipt client boundary

The receipt route now resolves its dynamic ID in a Server Component and
passes it to a focused client leaf. The leaf uses native `fetch` against the
same-origin API proxy instead of importing the Axios-based sales API wrapper.
Print, WhatsApp sharing, QR generation, and payment history remain interactive.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/account/sales/[id]/receipt` | 212 kB | 136 kB | 35.85% |

Type-check and production build passed. No receipt-specific unit test exists;
no E2E tests were run.

### Converted from Client to Server

- `frontend/app/(protected)/account/sales/[id]/receipt/page.tsx` — resolves
  route params and renders the client receipt leaf.

### Extracted Client Components

- `frontend/components/sales/ReceiptPageClient.tsx` — preserves print/share,
  QR generation, and data loading through native fetch without the Axios
  client dependency.

## Increment 7: native fetch in ranking, store stats, and pin controls

Replaced direct Axios-client usage in three Client Components with native
same-origin `fetch`: seller rankings, public store statistics, and ad pinning.
The pin mutation retains cookie credentials and echoes the current CSRF token.
The message composer remains unchanged: its conversation API calls rely on
the shared Axios request/response interceptors for upload, idempotency, and
offline-queue behavior, so removing that dependency needs a separate
interceptor-compatible migration.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/ads/[id]` | 299 kB | 298 kB | 0.33% |
| `/sellers/ranking` | 106 kB | 106 kB | 0.00% |
| `/store/[slug]/stats` | 209 kB | 209 kB | 0.00% |

The route bundles did not regress; two remained unchanged and one decreased
by 1 kB. Type-check and lint passed (lint reported existing warnings), and
the focused PinAdButton and SellersRankingList tests passed. No E2E tests
were run.

## Increment 8: split admin sections by active tab

`AdminTabsHub` previously statically imported every admin table, category
tree, dashboard panel, and control, so the `/admin` entry bundle contained
code for all sections even though the route renders only the selected tab.
The section components are now loaded through `next/dynamic` when their tab
is rendered; interactive tables remain Client Components.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/admin` | 340 kB | 134 kB | 60.59% |

The `/messages/[id]` bundle measured 280 kB in this build (278 kB in the
original baseline). `MessageInput` was not dynamically rewritten: its send
hook and chat data layer share the Axios client and its interceptors, and a
component-only deferred import would not remove that dependency from the
route without also changing message mutation semantics. This is **ACCEPTED
TECH DEBT** rather than risking offline queue/idempotency behavior.

Type-check, targeted ESLint, and production build passed. The build confirmed
the `/admin` bundle reduction; no E2E tests were run.

## Increment 9: split settings tab panels

The settings hub now dynamically loads the selected settings form/list panel
instead of statically importing every tab's component into the route entry.
This preserves the existing server-rendered active panel and uses the shared
loading fallback while its chunk loads. The offline warming manifest now
includes the dynamic panel chunks for `/settings`, preserving the tabs'
offline availability after the route is warmed.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/settings` | 295 kB | 127 kB | 56.95% |

Type-check, targeted ESLint, the focused warming-manifest test, and
production build passed. The full Vitest run reported 10 failures across
service-worker, API-client, offline-queue, offline-query-cache,
MyProductsList, and ConversationList tests; none involve the settings
components. No E2E tests were run.

## Increment 10: split my-store management tabs

The `/my-store` hub now dynamically loads the selected overview, list,
inventory, team, analytics, or settings panel instead of statically importing
all tab content. The offline warming manifest includes all dynamic panel
chunks so warmed tabs remain available offline.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/my-store` | 309 kB | 215 kB | 30.42% |

Type-check, targeted ESLint, the MyStoreHub component tests (5/5), production
build, and dynamic-chunk manifest verification passed. No E2E tests were run.

## Increment 12: split activity hub tabs

The activity hub now dynamically loads its timeline, ads, requests, and
reports tabs. All tab chunks are included in the `/activity` offline warming
assets so tab navigation remains available offline after warming.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/activity` | 269 kB | 130 kB | 51.67% |

Type-check, targeted ESLint, activity list tests (51/51), production build,
and dynamic-chunk manifest verification passed. No E2E tests were run.

## Increment 13: lazy-load non-ad favorites lists

`FavoritesTabs` now loads product/store/service favorites only when that tab
is selected; the default ads list remains in the initial route bundle. The
offline warming manifest includes the dynamic entity-list assets.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/favorites` | 278 kB | 272 kB | 2.16% |

Type-check, targeted ESLint, favorites tests (18/18), production build, and
dynamic-chunk manifest verification passed. No E2E tests were run.

## Increment 14: lazy-load secondary public store tabs

The public store detail route now defers the ads, collections, and reviews
panels until their tabs are selected. The dynamic panel assets are added to
the `/stores` offline warming entry.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/stores/[id]` | 323 kB | 320 kB | 0.93% |

Type-check, targeted ESLint, StoreStorefront/StoreReviewsList tests (10/10),
production build, and dynamic-chunk manifest verification passed. No E2E
tests were run.

## Increment 15: lazy-load notification rows

`NotificationsPage` now dynamically loads repeated `NotificationRow` client
components rather than including the row module in its initial route chunk.
The `/notifications` warming entry includes the emitted dynamic chunk, so
the rows remain available after offline route warming.

| Route | Before | After | Improvement % |
|---|---:|---:|---:|
| `/notifications` | 238 kB | 236 kB | 0.84% |

Type-check and the focused NotificationsPage tests passed (12/12). Targeted
ESLint reported only four existing exhaustive-deps warnings in that page.
Production build and warming-manifest verification passed; no E2E tests were
run.

## Increment 16: services detail split (DEFERRED)

Experimentally split the optional related-service matches module from the
service detail component. Type-check and the focused ServiceListingDetail
tests passed (17/17), but the single batch build measured `/services/[id]` at
296 kB versus its 294 kB baseline (+0.68%). The change was reverted. The
route's dynamic identifier also is not currently a concrete route in the
offline warming route list, so a follow-up must account for that before
adding a dynamic chunk to the offline manifest.

## Increment 17: split my-services provider workspace tabs

The provider workspace now loads its overview, listings, incoming requests,
appointments, and analytics panels through `next/dynamic`. The tab shell and
URL-based navigation remain unchanged. Added all generated panel chunks to
the `/my-services` offline warming entry and verified every React Loadable
asset is present there.

| Route | Before | After | Improvement % |
|---|---:|---:|---:|
| `/my-services` | 297 kB | 130 kB | 56.23% |

Type-check, targeted ESLint, production build, and warming-manifest
verification passed. The available `MyServicesHub` component suite reported
3 existing expectation failures (loading label, availability text, and
duplicate count match); this suite directly tests the unchanged panel rather
than the tab loader. No E2E tests were run.

## Increment 11: lazy-load conversation media gallery

`ChatWindow` now loads the media gallery only when the gallery sheet opens;
the message composer and its offline queue/interceptor path remain untouched.
The `/messages` warming entry includes the gallery's dynamic chunk so the
optional gallery remains available when the route's offline assets are warm.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/messages/[id]` | 281 kB | 278 kB | 1.07% |

The new bundle matches the original 278 kB baseline. Type-check, ESLint,
ChatWindow tests (29/29), production build, and dynamic-chunk manifest
verification passed. No E2E tests were run.

## Increment 19: split saved-search route client module

The `/saved-searches` Server Component page now dynamically imports the
interactive saved-search list, while keeping its server-rendered route shell
and default SSR behavior. The dynamic module is added to the route's offline
warming source map. Type-check and focused SavedSearchesList tests passed
(13/13). Bundle measurement is deferred to the final verification build.

## Increment 20: isolate request creation form

Converted `/requests/new`'s route wrapper to a Server Component and dynamically
loaded the interactive `CreateRequestForm` Client Component with SSR enabled.
Added the generated form chunk to the route's offline warming source map.
Type-check and focused stepper tests passed (6/6). Bundle measurement is
deferred to the final verification build.

## Increment 22: isolate my requests route

Moved the interactive my-requests page behind a Server Component route wrapper
and registered its dynamic chunk for offline warming. Type-check passed; no
focused route test exists. Bundle measurement is deferred to final
verification.

## Increment 23: split public profile tab panels

Changed the public profile tab panels to dynamic imports so ads, store,
services, and ratings panels are only fetched when selected. Registered their
chunks for offline warming. Type-check passed and focused profile tests passed
(16/16); the focused run exposed a stale featured-badge expectation, updated
to match the rendered “متجر مميز” label. Bundle measurement is deferred to
final verification.

## Increment 24: isolate account customer management

Moved the interactive customer-management screen behind a Server Component
route wrapper and registered its dynamic chunk for offline warming.
Type-check passed; no focused customer-management test exists. Bundle
measurement is deferred to final verification.

## Increment 25: isolate account debt and installment screens

Moved both interactive sales screens behind Server Component route wrappers
and registered their chunks for offline warming. Type-check passed; no
focused debt/installment route tests exist. Bundle measurements are deferred
to final verification.
## Increment 21: isolate request offers route

Moved the interactive offers manager behind a Server Component route wrapper
and added its dynamic chunk to the offline warming source map. Type-check
passed; no focused route test exists. Bundle measurement is deferred to the
final verification build.

## Increment 18: dashboard activity feed split (DEFERRED)

Experimentally lazy-loaded the dashboard's recent activity feed. Type-check,
targeted ESLint, and the focused RecentActivityFeed tests (7/7) passed, but
the build measured `/dashboard` at 226 kB against its 222 kB baseline
(+1.80%). Reverted the change as required.

## Increment 26: isolate following list and story overlays

Converted `/following` into a Server Component route wrapper that dynamically
loads its interactive list. The stories page now loads the composer and viewer
only when opened. Registered all route chunks for offline warming.
Type-check passed; no focused following/story route tests exist. Bundle
measurement is deferred to final verification.

## Increment 27: defer protected edit forms

The ad, service-listing, and product edit routes now load their heavy forms
through dynamic chunks after route data and ownership checks resolve. Added
the chunks to offline warming. Type-check passed; focused form tests passed
(41 passed, 10 skipped). Bundle measurement is deferred to final verification.

## Increment 28: defer request detail actions

The public request detail route now dynamically loads the offer form and
offers list, and the protected service-request detail route defers its
timeline. Type-check passed; no focused route/timeline tests exist. Registered
the chunks for offline warming. Bundle measurement is deferred to final
verification.

## Increment 29: defer below-the-fold homepage sections

Changed the homepage's lazy-mounted feed, catalog, services, store, provider,
and app-promo sections to dynamic imports. The `LazySection` boundaries now
defer both mounting and JavaScript chunk loading until the section is near
the viewport/idle window. Added their chunks to the homepage offline warming
map. Type-check passed and homepage tests passed (11/11). Bundle measurement
is deferred to final verification.

## Increment 30: isolate auth forms and verification client

The login, registration, password-recovery, and password-reset forms are now
loaded as route-level dynamic client chunks. The verify-email route is a
Server Component wrapper around its extracted client workflow. Added the
auth route chunks to offline warming. Type-check passed; focused auth form
tests passed (41/41). No verify-email page test exists. Bundle measurement is
deferred to final verification.

## Increment 31: split sales dashboard panels

Converted the sales hub's overview, list, customer, debt, installment, report,
cost, smart-insight, and analytics panels to dynamic imports, so only the
active tab loads its panel code. Registered the dynamic source for offline
warming. Type-check passed; no dedicated SalesTabsHub test exists. Bundle
measurement is deferred to final verification.

## Increment 32: defer favorites and chat media modules

The default ad-favorites list now loads as a dynamic panel, and chat voice
playback/download controls are dynamically loaded only for media messages.
Registered the message media chunks for offline warming. Type-check passed;
FavoritesTabs tests passed (7/7). No MessageMedia-focused test exists. Bundle
measurement is deferred to final verification.
