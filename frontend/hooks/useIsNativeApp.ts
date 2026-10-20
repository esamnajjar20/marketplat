'use client';

/**
 * Sync read of native shell — matches data-app-mode set by CapacitorBootstrap.
 * Prefer this over async isNativePlatform() inside render paths.
 */

import { useEffect, useState } from 'react';

function readIsNative(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.documentElement.dataset.appMode === 'native' ||
    document.documentElement.classList.contains('is-native-app')
  );
}

export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(readIsNative());
    // Bootstrap may set the attribute slightly after first paint
    const id = window.setTimeout(() => setNative(readIsNative()), 0);
    return () => window.clearTimeout(id);
  }, []);

  return native;
}
