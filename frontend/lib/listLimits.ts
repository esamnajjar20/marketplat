import { isDataSaverEnabled } from '@/lib/dataSaver';

/** Home / rail list size — fewer cards on constrained networks (N3). */
export function homeSectionLimit(normal = 8, saver = 4): number {
  if (typeof window !== 'undefined' && isDataSaverEnabled()) return saver;
  return normal;
}
