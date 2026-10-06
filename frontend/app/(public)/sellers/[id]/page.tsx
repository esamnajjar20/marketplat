import { redirect } from 'next/navigation';
import { sellersApi } from '@/api/sellers.api';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * UNIFIED-PROFILE: /sellers/[id] used to be a full standalone page
 * (SellerProfileHeader + ads + ad ratings + service reviews) — exactly
 * the duplicate-identity problem the profile unification a
 * seller is a *role* a person holds, not a separate page-worthy entity,
 * unlike a store (kept at /stores/[id] since it represents the store as
 * a commercial entity, not the person). /profile/[userId]'s own tabs
 * (ProfileTabsSection) now render everything this page used to —
 * seller badge/rating in the header, ads/ratings/service-reviews tabs —
 * so this route stays live only so old bookmarks/shared links keep
 * working, immediately forwarding to the canonical page. Server-side
 * (not the client useEffect pattern uses)
 * since resolving the target userId requires an actual data fetch
 * first — :id here is the SellerProfile's own id, not the userId
 * /profile/[id] expects (see sellersApi.getById's doc comment).
 *
 * A deleted/suspended seller (getById 404s, or getUserById on the
 * resulting profile page 404s if the account itself was deactivated)
 * falls through to /profile's own not-found EmptyState rather than
 * this page trying to render a second one — one 404 UI for the whole
 * flow instead of two slightly different ones.
 */
export default async function LegacySellerProfileRedirectPage({ params }: Props) {
  const { id } = await params;

  // NOTE: redirect() works by throwing a special NEXT_REDIRECT error
  // that Next.js's router catches higher up — calling it *inside* the
  // try block below would mean the catch{} here swallows that throw
  // and the redirect silently never happens. The fetch is awaited
  // inside try/catch to handle a real network/404 failure; the actual
  // redirect() call happens after, unconditionally, once targetUserId
  // is known.
  let targetUserId: string | null = null;
  try {
    const res = await sellersApi.getById(id);
    targetUserId = res.data.data?.userId ?? null;
  } catch {
    /* seller not found / request failed — fall through below */
  }

  // Seller not found (bad/old id) — still forward into /profile/[id]
  // with the same id so the person at least reaches the app's one
  // "not found" treatment instead of a raw 404, matching how
  // getUserById's own NotFoundError is surfaced there.
  redirect(ROUTES.userProfile(targetUserId ?? id));
}
