'use client';

import Link from 'next/link';
import { Clock, Ban } from 'lucide-react';
import { useMyStore } from '@/hooks/queries/useStores';
import { ROUTES } from '@/lib/constants';

/** Fixed strip on every /my-store/* page while store is not ACTIVE. */
export function StorePendingBanner() {
  const { data: store, isSuccess } = useMyStore();

  if (!isSuccess || !store) return null;
  if (store.status === 'ACTIVE') return null;

  if (store.status === 'BLOCKED') {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
        <Ban className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
        <p>
          <span className="font-semibold text-destructive">متجرك محظور</span>
          {' — '}غير ظاهر للزوار. تواصل مع الدعم.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm">
      <Clock className="h-4 w-4 shrink-0 text-warning dark:text-warning mt-0.5" />
      <p>
        <span className="font-semibold">متجرك غير ظاهر للزوار بعد</span>
        {' — '}قيد مراجعة الإدارة. يمكنك تجهيز{' '}
        <Link href={ROUTES.myStoreProducts} className="text-primary hover:underline">
          المنتجات
        </Link>
        {' '}و{' '}
        <Link href={ROUTES.myStorePromotions} className="text-primary hover:underline">
          العروض
        </Link>
        .
      </p>
    </div>
  );
}
