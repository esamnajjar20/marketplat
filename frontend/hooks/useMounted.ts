'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * FIX HYDRATION-418-HOME-01: true only AFTER hydration has finished.
 *
 * Why this exists: auth.store.ts persists `user` in localStorage and zustand's
 * persist middleware rehydrates it SYNCHRONOUSLY when the store module is first
 * imported in the browser. So on the very first client render — the one React
 * compares against the server HTML — `isHydrated` is already `true` and `user`
 * is already filled, whereas the server rendered with `isHydrated=false` and
 * `user=null`. Any markup/query-key derived from those two values therefore
 * differs between server and client → React error #418.
 *
 * useSyncExternalStore uses the server snapshot (`false`) during hydration and
 * flips to the client snapshot (`true`) right after, with no extra effect pass
 * and no flash on pure client-side navigations (there it returns `true` at once).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
