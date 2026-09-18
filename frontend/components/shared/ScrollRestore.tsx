'use client';

import { useScrollRestore } from '@/hooks/useScrollRestore';

/** Mount once under public/protected shell to keep list scroll positions. */
export function ScrollRestore() {
  useScrollRestore(true);
  return null;
}
