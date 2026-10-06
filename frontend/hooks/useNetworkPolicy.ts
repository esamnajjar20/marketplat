'use client';

import { useEffect, useState } from 'react';
import {
  getNetworkPolicy,
  subscribeNetworkPolicy,
  type NetworkPolicy,
} from '@/lib/networkPolicy';

export function useNetworkPolicy(): NetworkPolicy {
  const [policy, setPolicy] = useState<NetworkPolicy>(() => getNetworkPolicy());

  useEffect(() => {
    const refresh = () => setPolicy(getNetworkPolicy());
    refresh();
    return subscribeNetworkPolicy(refresh);
  }, []);

  return policy;
}
