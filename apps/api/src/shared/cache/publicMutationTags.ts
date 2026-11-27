/**
 * Resolve public cache tags for a successful write using the canonical cache
 * contract. Route/resource tag lists and safety guards are defined only in
 * shared/cache/cache-contract.json.
 */
import { CACHE_CONTRACT } from './cacheContract';

const PUBLIC_MUTATION_TAG_POLICY = CACHE_CONTRACT.publicMutationTags;
const MUTATION_METHODS = new Set(PUBLIC_MUTATION_TAG_POLICY.methods);
const RESERVED_SEGMENTS = new Set(PUBLIC_MUTATION_TAG_POLICY.reservedSegments);
const NON_PUBLIC_CONTENT_ACTIONS = new Set(PUBLIC_MUTATION_TAG_POLICY.nonPublicContentActions);
const SAFE_ENTITY_ID = new RegExp(PUBLIC_MUTATION_TAG_POLICY.safeEntityIdPattern);
const TAGS_BY_RESOURCE = PUBLIC_MUTATION_TAG_POLICY.resources;

/**
 * Returns no tags for reads, private domains, unknown paths, or malformed URLs.
 * The function is pure so the route mapping can be unit-tested independently.
 */
export function publicMutationCacheTags(method: string, originalUrl: string): string[] {
  if (!MUTATION_METHODS.has(method.toUpperCase())) return [];
  if (
    typeof originalUrl !== 'string' ||
    !originalUrl.startsWith('/') ||
    originalUrl.startsWith('//')
  ) return [];

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

  // Moderation writes are mounted below /admin, not below public resource routers.
  if (segments[0] === 'admin') {
    resourceIndex = 1;
    entityIndex = 2;
    if (segments[1] === 'fraud' && segments[2] === 'ads') {
      resourceIndex = 2;
      entityIndex = 3;
    }
  }

  const resource = segments[resourceIndex] as keyof typeof TAGS_BY_RESOURCE | undefined;
  if (!resource) return [];
  const resourcePolicy = TAGS_BY_RESOURCE[resource];
  if (!resourcePolicy) return [];

  const candidateId = segments[entityIndex];
  // The account's own /users/me endpoint is private profile state, not a public catalog mutation.
  if (resource === 'users' && candidateId?.toLowerCase() === 'me') return [];
  const trailingSegments = segments.slice(entityIndex + (candidateId ? 1 : 0));
  // User-specific counters, follows and member management do not change public catalogs.
  if (trailingSegments.some((segment) => NON_PUBLIC_CONTENT_ACTIONS.has(segment.toLowerCase()))) {
    return [];
  }

  const result = new Set<string>(resourcePolicy.routeTags);
  const entityPrefix = 'entityTagPrefix' in resourcePolicy
    ? resourcePolicy.entityTagPrefix
    : undefined;
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
