'use client';

import { useEffect, useState } from 'react';
import {
  getNetworkPolicy,
  subscribeNetworkPolicy,
  type NetworkPolicy,
} from '@/lib/networkPolicy';

// Keep the server render and the browser's first hydration render identical.
// getNetworkPolicy() reads navigator.connection, navigator.onLine and request
// timing samples, all of which can differ before hydration. Resolve the real
// device policy only after mount; this baseline mirrors the library's
// deterministic 'unknown' policy and is intentionally safe for initial UI.
const INITIAL_NETWORK_POLICY: NetworkPolicy = {
  tier: 'unknown',
  quality: 'unknown',
  saveData: false,
  effectiveType: null,
  downlinkMbps: null,
  rttMs: null,
  consecutiveFailures: 0,
  allowPrefetch: true,
  allowBackgroundWarming: true,
  allowBackgroundSync: true,
  allowOriginalImages: false,
  pageSizeMultiplier: 0.8,
  maxPrefetchDistancePx: 500,
  maxPrefetchConcurrency: 1,
  queueConcurrency: 1,
  uploadConcurrency: 1,
  uploadTimeoutMs: 35_000,
  uploadRetryDelaysMs: [2000],
  requestTimeoutMs: 18_000,
};

export function useNetworkPolicy(): NetworkPolicy {
  const [policy, setPolicy] = useState<NetworkPolicy>(INITIAL_NETWORK_POLICY);

  useEffect(() => {
    const refresh = () => setPolicy(getNetworkPolicy());
    refresh();
    return subscribeNetworkPolicy(refresh);
  }, []);

  return policy;
}
