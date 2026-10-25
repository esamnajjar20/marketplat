'use client';

import { MapPin, Calendar } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { cn } from '@/lib/utils';
import { ROUTES, CONDITION_LABELS, STATUS_LABELS } from '@/lib/constants';
import { AD_STATUS_VARIANT } from '@/lib/adStatus';
import { formatRelativeTime } from '@/lib/formatters';
import { SaveOfflineButton } from '@/components/shared/SaveOfflineButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { useCategories } from '@/hooks/queries/useCategories';
import { track } from '@/lib/analytics';
import { useRouter } from 'next/navigation';
import type { Ad } from '@/types/ad.types';

interface AdDetailMetadataProps {
  ad: Ad;
  favorited: boolean;
  onFavorite: () => void;
  toggleFavoritePending: boolean;
  now: number | null;
  isOwnAd: boolean;
  onStartConversation: () => void;
  startConversationPending: boolean;
}

export function AdDetailMetadata({
  ad,
  favorited,
  onFavorite,
  toggleFavoritePending,
  now,
  isOwnAd,
  onStartConversation,
  startConversationPending,
}: AdDetailMetadataProps) {
  const isAuth = useAuthStore(selectIsAuthenticated);
  const { data: categories } = useCategories();
  const router = useRouter();

  const categorySlug = categories?.find((c) => c.id === ad.categoryId)?.slug;
  const categoryUrl = categorySlug ? ROUTES.category(categorySlug) : `/search?categoryId=${ad.categoryId}`;

  const handleCategoryClick = (e: React.MouseEvent) => {
    e.preventDefault();
    track('CATEGORY_BROWSE', { adId: ad.id, categoryId: ad.categoryId });
    router.push(categoryUrl);
  };

  const handleStatusClick = (e: React.MouseEvent) => {
    e.preventDefault();
    track('AD_VIEW', { adId: ad.id, status: ad.status });
    router.push(`/search?status=${ad.status}`);
  };

  const handleConditionClick = (e: React.MouseEvent) => {
    e.preventDefault();
    track('AD_VIEW', { adId: ad.id, condition: ad.condition });
    router.push(`/search?condition=${ad.condition}`);
  };

  const conditionLabel = ad.condition ? CONDITION_LABELS[ad.condition] : ad.condition;

  return (
    <div className="rounded-2xl bg-card shadow-sm p-5 sm:p-7 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold leading-snug">{ad.title}</h1>
          <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ad.city}</span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{now === null ? '—' : formatRelativeTime(ad.createdAt, now)}</span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5">👁 {ad.views} مشاهدة</span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5 font-mono text-xs">#{ad.id.slice(-8)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant={favorited ? 'default' : 'outline'}
            size="sm"
            onClick={onFavorite}
            loading={toggleFavoritePending}
            aria-label={favorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
            aria-pressed={favorited}
            className="gap-1.5"
          >
            <svg className={cn('h-4 w-4', favorited && 'fill-current')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 1 0 7.78l-12 12a5.5 5.5 0 0 1-7.78 0l-12-12a5.5 5.5 0 0 1 0-7.78l12-12a5.5 5.5 0 0 1 7.78 0z" /></svg>
            {favorited ? 'محفوظ' : 'حفظ الإعلان'}
          </Button>
          <SaveOfflineButton
            type="ad"
            id={ad.id}
            title={ad.title}
            subtitle={ad.price != null ? String(ad.price) : null}
            city={ad.city ?? null}
            thumbnail={ad.images?.[0] ?? null}
            imageUrls={ad.images ?? []}
          />
          <ShareAdButton
            title={ad.title}
            qrPayload={{
              kind: 'ad',
              title: ad.title,
              price: ad.price ?? null,
              city: ad.city ?? null,
              extra: ad.condition ?? '',
              desc: ad.description?.slice(0, 300) ?? '',
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge
          variant={AD_STATUS_VARIANT[ad.status]}
          className="cursor-pointer hover:opacity-80"
          onClick={handleStatusClick}
        >
          {STATUS_LABELS[ad.status]}
        </Badge>
        <Badge
          variant="secondary"
          className="cursor-pointer hover:opacity-80"
          onClick={handleConditionClick}
        >
          {conditionLabel ?? ad.condition}
        </Badge>
        <Badge
          variant="outline"
          className="cursor-pointer hover:opacity-80"
          onClick={handleCategoryClick}
        >
          {ad.category?.name ?? ad.category?.nameAr ?? 'غير مصنف'}
        </Badge>
      </div>

      {!isOwnAd && isAuth && (
        <Button
          variant="default"
          size="lg"
          className="w-full gap-2 rounded-xl"
          loading={startConversationPending}
          loadingText="جارٍ…"
          onClick={onStartConversation}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          مراسلة البائع
        </Button>
      )}
    </div>
  );
}
