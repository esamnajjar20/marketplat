'use client';
import { reportBackgroundFailure } from '../../lib/backgroundTask';

import { useEffect } from 'react';

/**
 * Eruda console for mobile debugging — DEV ONLY.
 * Previously mounted unconditionally, which injected `<div id="eruda">`
 * into body[0] before React finished hydrating and caused #418
 * (args[]=HTML) on several routes. Guarded to development builds.
 */
export function ErudaDebug() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    import('eruda')
      .then((eruda) => eruda.default.init())
      .catch((error) => reportBackgroundFailure('frontend/components/debug/ErudaDebug.tsx', error));
  }, []);

  return null;
}
