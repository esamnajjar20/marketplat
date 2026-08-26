'use client';

import { useCallback, useEffect, useState } from 'react';
import { isDataSaverEnabled, setDataSaverEnabled } from '@/lib/dataSaver';

/** Reactive data-saver flag (localStorage + cross-tab/event sync). */
export function useDataSaver() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isDataSaverEnabled());
    function onStorage(e: StorageEvent) {
      if (e.key === 'marketplat:data-saver') setEnabled(e.newValue === '1');
    }
    function onCustom(e: Event) {
      setEnabled(Boolean((e as CustomEvent).detail));
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('marketplat:data-saver', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('marketplat:data-saver', onCustom as EventListener);
    };
  }, []);

  const set = useCallback((on: boolean) => {
    setDataSaverEnabled(on);
    setEnabled(on);
  }, []);

  return { enabled, setEnabled: set } as const;
}
