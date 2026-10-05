'use client';

import { Layers } from 'lucide-react';
import { useServiceRecommendations } from '@/hooks/queries/useRecommendations';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons';

interface Props {
  serviceListingId: string;
  categoryId: string | null;
  serviceTypeId?: string | null;
  /** عنوان موحّد مع "إعلانات مشابهة" / "منتجات مشابهة" */
  title?: string;
}

/**
 * قسم "خدمات مشابهة" — نفس بنية RelatedAds / RelatedProducts.
 * يعتمد على محرك التوصيات العام مع تقييد ServiceType، بدل طلب قائمة عامة ثم تصفيتها في العميل.
 */
export function RelatedServices({
  serviceListingId,
  categoryId,
  serviceTypeId,
  title = 'خدمات مشابهة',
}: Props) {
  const enabled = Boolean(categoryId || serviceTypeId);
  const { data, isLoading } = useServiceRecommendations(
    enabled ? { excludeServiceListingId: serviceListingId, serviceTypeId: serviceTypeId ?? undefined, limit: 8 } : undefined,
  );

  // بدون مجال/فئة لا نعرض قسماً عشوائياً من كل الخدمات
  if (!enabled) return null;

  const items = (data ?? []).filter((s) => s.id !== serviceListingId).slice(0, 6);

  if (isLoading) {
    return (
      <section className="space-y-4 border-t pt-8 pb-28 lg:pb-4">
        <h2 className="flex items-center gap-1.5 text-lg font-bold">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
          {title}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <ServiceListingCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section className="space-y-4 border-t pt-8 pb-28 lg:pb-4" aria-label={title}>
      <h2 className="flex items-center gap-1.5 text-lg font-bold">
        <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
        {title}
      </h2>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory sm:hidden [&::-webkit-scrollbar]:hidden">
        {items.map((s) => (
          <div key={s.id} className="w-[48%] min-w-[160px] max-w-[220px] shrink-0 snap-start">
            <ServiceListingCard listing={s} context="related" />
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-2 gap-3 sm:grid sm:gap-4 stagger-fade-in">
        {items.map((s) => (
          <ServiceListingCard key={s.id} listing={s} context="related" />
        ))}
      </div>
    </section>
  );
}
