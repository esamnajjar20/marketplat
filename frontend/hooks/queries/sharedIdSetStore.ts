'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

const EMPTY_ID_SET = new Set<string>();

type IdSetStore = {
  listeners: Set<() => void>;
  unsubscribeCache: (() => void) | null;
  getSnapshot: () => Set<string>;
  subscribe: (listener: () => void) => () => void;
};

const registries = new WeakMap<QueryClient, Map<string, IdSetStore>>();

function keyId(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

export function useQueryIdSetMembership(
  queryClient: QueryClient,
  queryKey: QueryKey,
  id: string,
  enabled: boolean,
): boolean {
  const store = useMemo(() => {
    let registry = registries.get(queryClient);
    if (!registry) {
      registry = new Map();
      registries.set(queryClient, registry);
    }

    const key = keyId(queryKey);
    const existing = registry.get(key);
    if (existing) return existing;

    const created: IdSetStore = {
      listeners: new Set(),
      unsubscribeCache: null,
      getSnapshot: () => queryClient.getQueryData<Set<string>>(queryKey) ?? EMPTY_ID_SET,
      subscribe: () => () => {},
    };

    created.subscribe = (listener) => {
      created.listeners.add(listener);
      if (!created.unsubscribeCache) {
        created.unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
          const eventKey = event.query.queryKey;
          if (eventKey.length !== queryKey.length || eventKey.some((part: unknown, index: number) => part !== queryKey[index])) return;
          for (const subscriber of created.listeners) subscriber();
        });
      }

      return () => {
        created.listeners.delete(listener);
        if (created.listeners.size === 0 && created.unsubscribeCache) {
          created.unsubscribeCache();
          created.unsubscribeCache = null;
          registry?.delete(key);
        }
      };
    };

    registry.set(key, created);
    return created;
  }, [queryClient, queryKey]);

  const subscribe = useMemo(
    () => (listener: () => void) => (enabled ? store.subscribe(listener) : () => {}),
    [store, enabled],
  );
  const getSnapshot = useMemo(
    () => () => (enabled ? store.getSnapshot().has(id) : false),
    [store, id, enabled],
  );
  const getServerSnapshot = useMemo(() => () => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
