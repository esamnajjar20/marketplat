# RSC migration report

## Increment 1: public profile follow pages

The 584-entry `audit/use-client-files.txt` inventory was triaged for this
increment. The two profile follow route entries used client-side query hooks
for public, paginated data. They now fetch on the server and render their list
and pagination as Server Components; follow-status queries and mutations stay
isolated in the new `FollowActionButton` Client Component.

| Route | Old Bundle Size | New Bundle Size | Improvement % |
|---|---:|---:|---:|
| `/profile/[id]/followers` | 215 kB | 214 kB | 0.47% |
| `/profile/[id]/following` | 215 kB | 214 kB | 0.47% |

Bundle values are Next.js **First Load JS** from `audit/rsc-baseline.md` and
the post-change production build. Each route entry's emitted client chunk
also fell from 1.86 kB to 166 B and 1.91 kB to 167 B, respectively. The
shared First Load JS remains 105 kB.

### Converted from Client to Server

- `frontend/app/(public)/profile/[id]/followers/page.tsx`
- `frontend/app/(public)/profile/[id]/following/page.tsx`

### Extracted Client Components

- `frontend/components/follows/FollowActionButton.tsx` — retains per-target
  follow status and follow/unfollow mutations at the interactive leaf.

### Deferred / not converted

- No attempted route conversion failed in this increment.
- `/requests/[id]` remains a Client Component for a later increment because
  its route entry currently owns request queries, authentication-dependent
  rendering, cancellation state/mutations, offer submission, and a dialog.
  Moving those behaviors requires a separate data/rendering split; it was
  left unchanged rather than risk removing the client boundary from hooks.
- `/products` and `/products/[id]` route entry files were already Server
  Components and were not changed.

No E2E tests were run.
