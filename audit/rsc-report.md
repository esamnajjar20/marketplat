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
  experiment was reverted rather than retaining a bundle regression; the
  existing route remains unchanged pending a smaller client-boundary split.
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

## Global infinite-scroll inventory

- `audit/infinite-scroll-inventory.md` records all six infinite-query routes,
  shared observer trigger, non-pagination IntersectionObserver and scroll
  listeners, and related tests.
- `/promoted` is converted to explicit Load More.
- Products, stores, services, unified search, ads/category results, and
  message-history pagination remain pending.
