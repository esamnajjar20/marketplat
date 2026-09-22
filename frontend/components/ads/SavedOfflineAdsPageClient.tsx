'use client';

/**
 * PHASE-OFFLINE-AD-DETAIL: قائمة الإعلانات المحفوظة يدويًا للعمل بدون اتصال.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { WifiOff, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { listSavedOfflineAds, unsaveAdOffline, type SavedOfflineAdMeta } from '@/lib/offlineSavedAds';
import { formatPrice } from '@/lib/formatters';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';
import { useAuthStore, selectUser } from '@/store/auth.store';

export function SavedOfflineAdsPageClient() {
  const user = useAuthStore(selectUser);
  const userId = user?.id ?? null;
  const [ads, setAds] = useState<SavedOfflineAdMeta[]>([]);
  const [query, setQuery] = useState('');

  const refresh = useCallback(() => {
    // FIX SAVED-ADS-USER-SCOPE: تمرير userId لتصفية محفوظات المستخدم.
    setAds(listSavedOfflineAds(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ads;
    return ads.filter(
      (ad) =>
        ad.title.toLowerCase().includes(q) ||
        (ad.city ?? '').toLowerCase().includes(q),
    );
  }, [ads, query]);

  async function handleRemove(id: string) {
    await unsaveAdOffline(id, userId);
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
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث في الإعلانات المحفوظة…"
          className="h-11 ps-10"
          aria-label="بحث في المحفوظات"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="لا نتائج"
          description="جرّب كلمة أخرى أو امسح البحث."
        />
      ) : (
        <ul className="flex flex-col gap-3" role="list">
          {filtered.map((ad) => (
            <li
              key={ad.id}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm"
            >
              <Link
                prefetch={false}
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
      )}
    </div>
  );
}
