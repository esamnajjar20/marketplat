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
- `/requests/[id]` remains a Client Component for a later increment because
  its route entry currently owns request queries, authentication-dependent
  rendering, cancellation state/mutations, offer submission, and a dialog.
  Moving those behaviors requires a separate data/rendering split; it was
  left unchanged rather than risk removing the client boundary from hooks.
- `/products` and `/products/[id]` route entry files were already Server
  Components and were not changed.

No E2E tests were run.
