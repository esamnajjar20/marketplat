import contract from './cache-contract.json';
import type { CacheDomain } from './cacheContract';
export type CacheInvalidationRule = { prefixes: readonly string[]; domains: readonly CacheDomain[]; local: readonly string[] };
export const CACHE_INVALIDATION_REGISTRY = contract.invalidation as readonly CacheInvalidationRule[];
export function getCacheInvalidationRule(pathname: string): CacheInvalidationRule | null {
  return CACHE_INVALIDATION_REGISTRY.find((rule) => rule.prefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`),
  )) ?? null;
}
