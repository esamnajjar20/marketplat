'use client';

/**
 * useDataSaver — the single data-saver subscription for the app.
 *
 * This used to exist twice with different behaviour:
 *  - lib/useDataSaver.ts   (boolean; called hydrateDataSaver(); no cross-tab sync)
 *  - hooks/useDataSaver.ts ({ enabled, setEnabled }; cross-tab sync; but NEVER
 *    hydrated, so on a hard load of the settings page the toggle read `false`
 *    until some other component happened to call hydrateDataSaver()).
 *
 * Both now share `useDataSaverState` below; the controls variant
 * (useDataSaverControls) is what DataSaverToggle uses.
 */

import { useCallback, useEffect, useState } from 'react';
import { hydrateDataSaver, isDataSaverEnabled, setDataSaverEnabled } from '@/lib/dataSaver';

const KEY = 'marketplat:data-saver';
const EVENT = 'marketplat:data-saver';

function useDataSaverState() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    hydrateDataSaver();

    const sync = () => setEnabled(isDataSaverEnabled());
    sync();

    // Same-tab: setDataSaverEnabled() dispatches a CustomEvent with the chosen
    // value. A slow connection can still force the saver on when the user
    // switches it off, so "off" is resolved through isDataSaverEnabled().
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEnabled(typeof detail === 'boolean' ? detail || isDataSaverEnabled() : isDataSaverEnabled());
    };
    // Other tabs: localStorage changes arrive as `storage` events.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === KEY) sync();
    };

    window.addEventListener(EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return [enabled, setEnabled] as const;
}

/** Read-only flag — used by the home sections / data hooks. */
export function useDataSaver(): boolean {
  return useDataSaverState()[0];
}

/** Flag + setter — used by DataSaverToggle. */
export function useDataSaverControls() {
  const [enabled, setLocal] = useDataSaverState();
  const setEnabled = useCallback(
    (on: boolean) => {
      setDataSaverEnabled(on);
      setLocal(on);
    },
    [setLocal],
  );
  return { enabled, setEnabled } as const;
}
