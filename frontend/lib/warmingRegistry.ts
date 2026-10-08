/**
 * Canonical client warming registry.
 *
 * W0: every background warming workload gets one identity, priority, cost
 * envelope and eligibility policy. Execution remains owned by the existing
 * warming modules; this registry is the contract used by the planner/engine.
 */

export type WarmingJobId =
  | 'core-data'
  | 'public-routes'
  | 'personal-routes'
  | 'user-data';

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
  'core-data': {
    id: 'core-data',
    priority: 100,
    cost: { requests: 8, bytes: 1_000_000, durationMs: 15_000 },
    requiresAuth: false,
    order: 0,
  },
  'public-routes': {
    id: 'public-routes',
    priority: 90,
    cost: { requests: 8, bytes: 1_500_000, durationMs: 30_000 },
    requiresAuth: false,
    order: 1,
  },
  'personal-routes': {
    id: 'personal-routes',
    priority: 80,
    cost: { requests: 8, bytes: 1_200_000, durationMs: 30_000 },
    requiresAuth: true,
    order: 2,
  },
  'user-data': {
    id: 'user-data',
    priority: 70,
    cost: { requests: 8, bytes: 800_000, durationMs: 20_000 },
    requiresAuth: true,
    order: 3,
  },
};

export const WARMING_JOB_IDS: readonly WarmingJobId[] = [
  'core-data',
  'public-routes',
  'personal-routes',
  'user-data',
];

export function getWarmingJob(id: WarmingJobId): WarmingJobDefinition {
  return WARMING_REGISTRY[id];
}
