'use client';

import { useEffect, useState } from 'react';
import { hydrateDataSaver, isDataSaverEnabled } from '@/lib/dataSaver';

const EVENT = 'marketplat:data-saver';

export function useDataSaver(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    hydrateDataSaver();

    const sync = () => {
      setEnabled(isDataSaverEnabled());
    };

    sync();

    window.addEventListener(EVENT, sync);

    return () => {
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  return enabled;
}
