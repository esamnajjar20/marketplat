import { getNetworkPolicy, type NetworkTier } from '@/lib/networkPolicy';

/**
 * Extend freshness windows for public, read-mostly lists on constrained links.
 * This reduces redundant revalidation while keeping normal-network freshness
 * unchanged. Personal/security queries must not use this helper.
 */
export function calculateNetworkAwareStaleTime(
  baseMs: number,
  tier: NetworkTier,
  saveData: boolean,
): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return Math.max(0, baseMs || 0);
  if (tier === 'offline') return baseMs;
  if (saveData || tier === 'very-slow') return baseMs * 2;
  if (tier === 'slow') return Math.round(baseMs * 1.5);
  return baseMs;
}

/** Runtime policy wrapper for public list queries only. */
export function getPublicListStaleTime(baseMs: number): number {
  const policy = getNetworkPolicy();
  return calculateNetworkAwareStaleTime(baseMs, policy.tier, policy.saveData);
}
