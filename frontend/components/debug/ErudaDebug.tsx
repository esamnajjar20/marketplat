'use client';
import { reportBackgroundFailure } from '../../lib/backgroundTask';

import { useEffect } from 'react';

export function ErudaDebug() {
  useEffect(() => {
    import('eruda')
      .then((eruda) => eruda.default.init())
      .catch((error) => reportBackgroundFailure('frontend/components/debug/ErudaDebug.tsx', error));
  }, []);

  return null;
}
