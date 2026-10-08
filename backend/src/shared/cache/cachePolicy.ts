import policy from './cache-policy.json';

export const CACHE_POLICY = policy;
export type CachePolicyName = keyof typeof CACHE_POLICY;
export const cachePolicy = <K extends CachePolicyName>(name: K): (typeof CACHE_POLICY)[K] =>
  CACHE_POLICY[name];
