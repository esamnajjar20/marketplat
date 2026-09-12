'use client';

import { useEffect } from 'react';

export function ErudaDebug() {
  useEffect(() => {
    import('eruda')
      .then((eruda) => eruda.default.init())
      .catch(() => {});
  }, []);

  return null;
}
