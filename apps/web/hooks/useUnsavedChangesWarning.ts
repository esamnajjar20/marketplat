'use client';

import { useEffect } from 'react';

/** Protects long forms from accidental browser/tab close while dirty. */
export function useUnsavedChangesWarning(enabled: boolean, message = 'لديك تغييرات غير محفوظة.') {
  useEffect(() => {
    if (!enabled) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled, message]);
}
