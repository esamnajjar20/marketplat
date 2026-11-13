import { useEffect } from 'react';
import { deferToIdle } from '@/lib/idle';
import { prunePublicCacheExpired } from '@/storage/public-cache';
import { logger } from '@/lib/logger';

const MAINTENANCE_DELAY_MS = 4_000;

/** صيانة خفيفة مرة واحدة بعد الإقلاع، وبعيدًا عن أول رسم: حذف سجلات الكاش المنتهية. */
export function useDeferredStartupMaintenance(): void {
  useEffect(() => deferToIdle(() => {
    void prunePublicCacheExpired().then((removed) => {
      if (removed > 0) logger.info('startup-maintenance', `Pruned ${removed} expired cache rows`);
    });
  }, { delayMs: MAINTENANCE_DELAY_MS }), []);
}
