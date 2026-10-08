import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { getCacheInvalidationRule } from './cacheInvalidationRegistry';
import { getCacheDomain, type CacheDomain } from './cacheContract';

export async function invalidateCacheDomains(queryClient: QueryClient, domains: readonly CacheDomain[]): Promise<void> {
  const prefixes = new Map<string, QueryKey>();
  for (const domain of domains) {
    const definition = getCacheDomain(domain) as { queryPrefixes?: readonly (readonly unknown[])[] };
    for (const prefix of definition.queryPrefixes ?? []) {
      const key = JSON.stringify(prefix);
      if (!prefixes.has(key)) prefixes.set(key, [...prefix]);
    }
  }
  await Promise.all([...prefixes.values()].map((queryKey) =>
    queryClient.invalidateQueries({ queryKey, refetchType: 'active' }),
  ));
}

export async function invalidateReactQueryForMutation(queryClient: QueryClient, url: string): Promise<boolean> {
  let pathname: string;
  try { pathname = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').pathname; } catch { return false; }
  const normalized = pathname.replace(/^\/api\/v\d+/, '').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  const rule = getCacheInvalidationRule(normalized);
  if (!rule || rule.domains.length === 0) return false;
  await invalidateCacheDomains(queryClient, rule.domains);
  return true;
}
