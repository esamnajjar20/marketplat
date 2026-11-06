/**
 * Derive the Next.js Data Cache tags affected by a successful public mutation.
 * This vocabulary is intentionally shared with frontend/lib/server/serverCacheTags.ts
 * and the Next revalidation Route Handler.
 */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const RESERVED_SEGMENTS = new Set([
  'me', 'search', 'featured', 'ranking', 'suggestions', 'categories',
  'types', 'availability', 'nearby', 'stats', 'analytics', 'bulk',
]);
const NON_PUBLIC_CONTENT_ACTIONS = new Set([
  'follow', 'unfollow', 'favorite', 'favorites', 'like', 'likes',
  'view', 'views', 'click', 'clicks', 'impression', 'impressions',
  'tracking', 'track', 'share', 'shares', 'members', 'memberships',
  'member-invites',
]);
const SAFE_ENTITY_ID = /^[A-Za-z0-9_-]{1,128}$/;

const TAGS_BY_RESOURCE: Record<string, readonly string[]> = {
  ads: ['route:ads', 'route:home', 'route:search'],
  products: ['route:products', 'route:collections', 'route:home'],
  promotions: ['route:products', 'route:collections', 'route:home'],
  collections: ['route:collections', 'route:products', 'route:home'],
  stores: ['route:stores', 'route:badges', 'route:public', 'route:home'],
  sellers: ['route:sellers', 'route:badges', 'route:public'],
  'service-reviews': ['route:service-reviews', 'route:badges'],
  sales: ['route:public'],
  'store-types': ['route:store-types', 'route:stores', 'route:home'],
  'service-listings': ['route:service-listings', 'route:home'],
  'service-providers': ['route:service-providers', 'route:service-listings', 'route:badges', 'route:home'],
  'service-categories': ['route:service-categories', 'route:service-listings', 'route:home'],
  'service-types': ['route:service-types', 'route:service-listings', 'route:home'],
  categories: ['route:categories', 'route:ads', 'route:products', 'route:home'],
  'product-categories': ['route:product-categories', 'route:products', 'route:ads', 'route:home'],
};

const ENTITY_TAG_PREFIX_BY_RESOURCE: Record<string, string> = {
  ads: 'ad',
  products: 'product',
  stores: 'store',
  'service-listings': 'service',
  'service-providers': 'provider',
  categories: 'category',
  'product-categories': 'category',
  'service-categories': 'category',
  sellers: 'seller',
};

/**
 * Returns no tags for reads, private domains, unknown paths, or malformed URLs.
 * The function is pure so the route mapping can be unit-tested independently.
 */
export function publicMutationCacheTags(method: string, originalUrl: string): string[] {
  if (!MUTATION_METHODS.has(method.toUpperCase())) return [];
  if (typeof originalUrl !== 'string' || !originalUrl.startsWith('/') || originalUrl.startsWith('//')) return [];

  let segments: string[];
  try {
    const pathname = new URL(originalUrl, 'http://marketplat-api.invalid').pathname;
    const prefix = '/api/v1/';
    if (!pathname.startsWith(prefix)) return [];
    segments = pathname.slice(prefix.length).split('/').filter(Boolean);
  } catch {
    return [];
  }

  let resourceIndex = 0;
  let entityIndex = 1;

  // Moderation writes are mounted below /admin, not below the public resource
  // routers. They still change the same public lists and must invalidate them.
  if (segments[0] === 'admin') {
    resourceIndex = 1;
    entityIndex = 2;
    if (segments[1] === 'fraud' && segments[2] === 'ads') {
      resourceIndex = 2;
      entityIndex = 3;
    }
  }

  const resource = segments[resourceIndex];
  if (!resource) return [];
  const tags = TAGS_BY_RESOURCE[resource];
  if (!tags) return [];

  const candidateId = segments[entityIndex];
  const trailingSegments = segments.slice(entityIndex + (candidateId ? 1 : 0));
  // User-specific counters, follows and member management do not alter the
  // public catalog. Avoid invalidating public lists for ordinary engagement.
  if (trailingSegments.some((segment) => NON_PUBLIC_CONTENT_ACTIONS.has(segment.toLowerCase()))) {
    return [];
  }

  const result = new Set(tags);
  const entityPrefix = ENTITY_TAG_PREFIX_BY_RESOURCE[resource];
  if (
    entityPrefix &&
    candidateId &&
    !RESERVED_SEGMENTS.has(candidateId.toLowerCase()) &&
    SAFE_ENTITY_ID.test(candidateId)
  ) {
    result.add(`${entityPrefix}:${candidateId}`);
  }

  return [...result];
}
