import contract from './cache-contract.json';
export const CACHE_CONTRACT = contract;
export type CacheDomain = keyof typeof CACHE_CONTRACT.domains;
export type CacheScope = (typeof CACHE_CONTRACT.domains)[CacheDomain]['scope'];
export function getCacheDomain(domain: CacheDomain) { return CACHE_CONTRACT.domains[domain]; }
