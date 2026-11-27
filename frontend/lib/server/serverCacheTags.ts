/**
 * Next Data Cache tags are read from the canonical shared cache contract.
 * Backend mutation invalidation consumes the matching publicMutationTags map.
 */
import contract from '../cache/cache-contract.json';

const PUBLIC_READ_TAG_POLICY = contract.publicReadTags;

export const SERVER_CACHE_TAGS = PUBLIC_READ_TAG_POLICY.vocabulary;

/** Resolve tags only for explicitly public, viewer-independent GET paths. */
export function getPublicApiCacheTags(path: string): readonly string[] {
  const pathname = new URL(path, 'https://marketplat-internal.invalid').pathname.replace(/\/$/, '') || '/';
  const matched = PUBLIC_READ_TAG_POLICY.paths.find((entry) => entry.path === pathname);
  if (!matched) {
    throw new Error(`No public Next cache policy is registered for API path: ${pathname}`);
  }

  const vocabulary = PUBLIC_READ_TAG_POLICY.vocabulary;
  const tags = matched.tagKeys.map((key) => vocabulary[key as keyof typeof vocabulary]);
  return [...tags, 'api'];
}

/** Entity tags are used by detail reads that are safe to cache in a later phase. */
export const entityCacheTag = {
  ad: (id: string) => `${PUBLIC_READ_TAG_POLICY.entityPrefixes.ad}:${id}`,
  product: (id: string) => `${PUBLIC_READ_TAG_POLICY.entityPrefixes.product}:${id}`,
  store: (id: string) => `${PUBLIC_READ_TAG_POLICY.entityPrefixes.store}:${id}`,
  service: (id: string) => `${PUBLIC_READ_TAG_POLICY.entityPrefixes.service}:${id}`,
  category: (id: string) => `${PUBLIC_READ_TAG_POLICY.entityPrefixes.category}:${id}`,
} as const;
