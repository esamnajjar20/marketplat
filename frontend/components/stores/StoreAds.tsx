'use client';

import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { adsApi } from '@/api/ads.api';
import { AdCard } from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { queryKeys } from '@/lib/queryKeys';

interface Props {
  storeId: string;
  storeName: string;
}

/**
 * إعلانات منشورة باسم هذا المتجر (storeId) — منفصلة عن إعلانات البائع الشخصية.
 */
export function StoreAds({ storeId, storeName }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.ads.list({ storeId, limit: 24 }),
    queryFn: async () => {
      const res = await adsApi.getAll({ storeId, limit: 24, page: 1 } as never);
      // دعم أشكال الاستجابة المختلفة
      const body = (res as { data?: { data?: unknown } }).data?.data ?? (res as { data?: unknown }).data ?? res;
      if (body && typeof body === 'object' && 'items' in (body as object)) {
        return body as { items: unknown[]; meta?: unknown };
      }
      if (Array.isArray(body)) return { items: body };
      return { items: [] };
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <AdCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-destructive">تعذّر تحميل إعلانات المتجر</p>;
  }

  const items = (data?.items ?? []) as Parameters<typeof AdCard>[0]['ad'][];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone className="h-10 w-10" />}
        title="لا إعلانات لهذا المتجر"
        description={`لم ينشر «${storeName}» إعلانات بعد`}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}
