/**
 * lib/edgeProxy.ts
 *
 * EDGE-AUTH-STRIP-01: decides which /api/v1 GET requests are safe to serve
 * from the Cloudflare edge cache EVEN WHEN the browser is logged in.
 *
 * Why this exists: api/client.ts attaches `Authorization: Bearer …` to every
 * request of a logged-in user, and the browser also sends cookies on every
 * same-origin /api/v1 call. app/api/v1/[...path]/route.ts used to send any
 * request carrying either one straight to Render — so logged-in users never
 * touched the edge cache, even for public lists that are byte-identical for
 * everyone.
 *
 * Safety rule (deny by default): a path is "viewer-independent" only if it
 * matches one of the exact shapes below. Each shape was checked against the
 * backend route + controller and uses no `req.user` / Authorization.
 * Deliberately NOT listed (they vary per viewer or need auth):
 *   - home/feed            (varies by bearer identity)
 *   - recommendations      (personalised)
 *   - requests, requests/:id (optionalAuthenticate → viewerId)
 *   - any path with a me / admin / stock / members / offers segment
 *     (e.g. ads/me, stores/:id/members, products/stock/summary)
 *
 * When adding a public route to the backend, it is NOT cached for logged-in
 * users until you add its shape here — the safe default.
 */

const RESERVED_SEGMENTS = new Set(['me', 'stock', 'admin', 'feed', 'members', 'offers']);

type Shape = (segs: string[]) => boolean;

const exact = (root: string): Shape => (s) => s.length === 1 && s[0] === root;
const root_id = (root: string): Shape => (s) => s.length === 2 && s[0] === root;
const root_literal = (root: string, lit: string): Shape => (s) =>
  s.length === 2 && s[0] === root && s[1] === lit;
const root_id_literal = (root: string, lit: string): Shape => (s) =>
  s.length === 3 && s[0] === root && s[2] === lit;
const root_slug = (root: string): Shape => (s) =>
  s.length === 3 && s[0] === root && s[1] === 'slug';

const SHAPES: Shape[] = [
  exact('home'),
  // reference data
  ...['categories', 'product-categories', 'service-categories'].flatMap((r) => [
    exact(r), root_id(r), root_slug(r),
  ]),
  exact('service-types'),
  exact('store-types'),
  // ads
  exact('ads'),
  root_literal('ads', 'search'),
  root_id('ads'),
  root_id_literal('ads', 'related'),
  // products / stores
  exact('products'),
  root_id('products'),
  exact('stores'),
  root_id('stores'),
  root_id_literal('stores', 'reviews'),
  // services
  exact('service-listings'),
  root_id('service-listings'),
  root_id_literal('service-listings', 'matches'),
  exact('service-providers'),
  root_literal('service-providers', 'nearby'),
  root_id('service-providers'),
  // search
  exact('search'),
  root_literal('search', 'suggestions'),
  // sellers
  root_literal('sellers', 'ranking'),
  root_id('sellers'),
  root_id_literal('sellers', 'ratings'),
];

/** True when the response is identical for every viewer (GET/HEAD only). */
export function isViewerIndependentPath(method: string, path: string[]): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (path.length === 0 || path.some((s) => s === '' || RESERVED_SEGMENTS.has(s))) return false;
  return SHAPES.some((match) => match(path));
}

/** Headers that identify a viewer or a session — removed before the edge hop. */
const IDENTITY_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-csrf-token',
  'x-offline-op-id',
]);

export function stripIdentityHeaders(src: Headers): Headers {
  const out = new Headers();
  for (const [k, v] of src.entries()) {
    const key = k.toLowerCase();
    if (key === 'host' || IDENTITY_HEADERS.has(key)) continue;
    out.set(k, v);
  }
  return out;
}
