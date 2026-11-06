'use client';

import { useQuery } from '@tanstack/react-query';
import { isPublicFeatureFlagEnabled, PUBLIC_FEATURE_FLAGS_QUERY_KEY, type PublicFeatureFlag } from '@/lib/publicFeatureFlags';

type PublicFeatureFlagsResponse = {
  ok: boolean;
  flags?: Record<string, PublicFeatureFlag>;
};

async function fetchPublicFeatureFlags(): Promise<Record<string, PublicFeatureFlag>> {
  const response = await fetch('/api/public/feature-flags', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null) as PublicFeatureFlagsResponse | null;
  if (!response.ok || payload?.ok !== true || !payload.flags || typeof payload.flags !== 'object') {
    throw new Error('PUBLIC_FEATURE_FLAGS_UNAVAILABLE');
  }
  return Object.fromEntries(
    Object.entries(payload.flags).filter(([name, flag]) =>
      name.startsWith('PUBLIC_') && flag !== null && typeof flag === 'object' &&
      typeof flag.enabled === 'boolean' && Number.isInteger(flag.rolloutPercent) &&
      flag.rolloutPercent >= 0 && flag.rolloutPercent <= 100
    ),
  );
}

/**
 * Reads a public feature flag and applies a stable percentage cohort.
 * Supply a stable, non-secret subject (normally the authenticated user ID)
 * when rolloutPercent is below 100. Without one, percentage rollouts fail closed.
 */
export function usePublicFeatureFlag(
  name: `PUBLIC_${string}`,
  fallback = false,
  subject?: string | null,
): boolean {
  const query = useQuery({
    queryKey: PUBLIC_FEATURE_FLAGS_QUERY_KEY,
    queryFn: fetchPublicFeatureFlags,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const flag = query.data?.[name];
  if (!flag) return fallback;
  return isPublicFeatureFlagEnabled(name, flag, subject);
}
