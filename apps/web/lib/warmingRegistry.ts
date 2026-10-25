/**
 * Canonical client warming registry.
 *
 * W0: every background warming workload gets one identity, priority, cost
 * envelope and eligibility policy. Execution remains owned by the existing
 * warming modules; this registry is the contract used by the planner/engine.
 */

/**
 * Only page shells are warmed in the background. Data (lists, user records,
 * thumbnails) is no longer pre-fetched: it is cached when the user actually
 * opens it (service worker runtime caching + offline JSON/list caches).
 */
export type WarmingJobId =
  | 'public-routes'
  | 'personal-routes';

export type WarmingCost = {
  /** Conservative request estimate used for admission control, not telemetry. */
  requests: number;
  /** Conservative transfer estimate used for admission control, in bytes. */
  bytes: number;
  /** Expected wall-clock budget, in milliseconds. */
  durationMs: number;
};

export interface WarmingJobDefinition {
  id: WarmingJobId;
  priority: number;
  cost: WarmingCost;
  requiresAuth: boolean;
  /** Lower numbers are run first when priorities tie. */
  order: number;
}

export const WARMING_REGISTRY: Readonly<Record<WarmingJobId, WarmingJobDefinition>> = {
  'public-routes': {
    id: 'public-routes',
    priority: 90,
    cost: { requests: 8, bytes: 1_500_000, durationMs: 30_000 },
    requiresAuth: false,
    order: 0,
  },
  'personal-routes': {
    id: 'personal-routes',
    priority: 80,
    cost: { requests: 8, bytes: 1_200_000, durationMs: 30_000 },
    requiresAuth: true,
    order: 1,
  },
};

export const WARMING_JOB_IDS: readonly WarmingJobId[] = [
  'public-routes',
  'personal-routes',
];

export function getWarmingJob(id: WarmingJobId): WarmingJobDefinition {
  return WARMING_REGISTRY[id];
}
