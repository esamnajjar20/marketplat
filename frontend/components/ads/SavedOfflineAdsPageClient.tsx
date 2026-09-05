'use client';

/**
 * PHASE-OFFLINE-AD-DETAIL: قائمة الإعلانات المحفوظة يدويًا للعمل بدون
 * اتصال (زر "حفظ دون اتصال" بـ AdDetail.tsx) — تخزين محلي بحت، بلا حاجة
 * لتسجيل دخول ولا اتصال بالسيرفر لعرض هذه الصفحة نفسها.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { WifiOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { listSavedOfflineAds, unsaveAdOffline, type SavedOfflineAdMeta } from '@/lib/offlineSavedAds';
import { formatPrice } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';

export function SavedOfflineAdsPageClient() {
  const [ads, setAds] = useState<SavedOfflineAdMeta[]>([]);

  const refresh = useCallback(() => {
    setAds(listSavedOfflineAds());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleRemove(id: string) {
    await unsaveAdOffline(id);
    toast.success('أُزيل من المحفوظات دون اتصال');
    refresh();
  }

  if (ads.length === 0) {
    return (
      <EmptyState
        icon={<WifiOff />}
        title="لا توجد إعلانات محفوظة دون اتصال"
        description={'افتح أي إعلان واضغط "حفظ دون اتصال" لتتمكن من فتحه لاحقًا حتى بدون إنترنت.'}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3" role="list">
      {ads.map((ad) => (
        <li
          key={ad.id}
          className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm"
        >
          <Link
            href={ROUTES.adDetail(ad.id)}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted"
          >
            {ad.thumbnail && (
              <SafeImage src={ad.thumbnail} alt={ad.title} fill className="object-cover" sizes="64px" />
            )}
          </Link>
          <Link href={ROUTES.adDetail(ad.id)} className="min-w-0 flex-1">
            <p className="truncate font-semibold">{ad.title}</p>
            <p className="text-sm text-muted-foreground">
              {formatPrice(ad.price)} · {ad.city}
            </p>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="إزالة من المحفوظات دون اتصال"
            onClick={() => handleRemove(ad.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
