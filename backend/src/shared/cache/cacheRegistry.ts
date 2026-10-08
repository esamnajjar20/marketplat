import contract from './cache-contract.json';

/** Canonical server cache inventory. Every server cache must map to one contract domain. */
export const CACHE_REGISTRY = Object.fromEntries(
  Object.entries(contract.domains).map(([domain, definition]) => [domain, {
    policy: definition.policy,
    scope: definition.scope,
    namespace: definition.namespace,
    shared: definition.scope === 'public',
    personal: definition.scope !== 'public',
  }]),
) as Record<keyof typeof contract.domains, {
  policy: string;
  scope: string;
  namespace: string;
  shared: boolean;
  personal: boolean;
}>;
export type CacheRegistryName = keyof typeof CACHE_REGISTRY;
