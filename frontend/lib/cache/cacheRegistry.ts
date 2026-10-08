import contract from './cache-contract.json';

/** Canonical browser cache inventory. Storage implementations must map to these domains. */
export const CLIENT_CACHE_REGISTRY = Object.fromEntries(
  Object.entries(contract.domains).map(([domain, definition]) => [domain, {
    layer: definition.scope === 'public' ? 'shared-client' : 'private-client',
    owner: definition.scope === 'public' ? 'react-query/service-worker' : 'react-query/offline',
    policy: definition.policy,
    namespace: definition.namespace,
  }]),
) as Record<keyof typeof contract.domains, {
  layer: string;
  owner: string;
  policy: string;
  namespace: string;
}>;
