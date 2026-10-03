'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getListThumbnailUrl, getPlaceholderUrl, isCloudinaryUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { onIntentPrefetch } from '@/lib/prefetchOnIntent';
import { useIsFavorited } from '@/hooks/queries/useFavorites';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { AdListItem } from '@/types/ad.types';
import { cn } from '@/lib/utils';
import { CardKindBadge, CardOfflineBadge, type CardContext, useNowAfterMount } from '@/components/shared/cards/cardParts';
import { CARD_BODY_COMPACT, CARD_BODY_DEFAULT, CARD_IMAGE_43, CARD_SHELL, HIT_AREA, TIME_PLACEHOLDER, freshnessClass } from '@/components/shared/cards/cardTokens';

interface Props {
  ad: AdListItem;
  context?: CardContext;
  className?: string;
  priority?: boolean;
  density?: 'default' | 'compact';
  showKind?: boolean;
}

export function AdCard({ ad, context = 'public', className, priority = false, density = 'default', showKind = false }: Props) {
  const compact = density === 'compact';
  const router = useRouter();
  const detailHref = ROUTES.adDetail(ad.id);
  const rawImage = ad.images[0];
  const thumb = rawImage ? getListThumbnailUrl(rawImage, 320, 240) : PLACEHOLDER_SVG;
  const blurDataURL = rawImage && isCloudinaryUrl(rawImage) ? getPlaceholderUrl(rawImage) : undefined;
  const isSold = ad.status === 'SOLD';
  const now = useNowAfterMount();
  const timeColorClass = freshnessClass(now, ad.createdAt);
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isOnline = useOnlineStatus();
  const isFavorited = useIsFavorited(ad.id);
  const toggleFavorite = useToggleFavorite();
  const [popKey, setPopKey] = useState(0);
  const showCity = context !== 'store' && context !== 'owner';
  const showTime = context !== 'store' && context !== 'related';
  const showSeller = context === 'favorites';
  const showHeart = context !== 'owner' && isOnline;
  const sellerName = ad.store?.id ? ad.store.name : ad.user.name;

  function warmDetail() { onIntentPrefetch(`ad:${ad.id}`, () => router.prefetch(detailHref)); }
  function handleFavoriteClick(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!isAuth) { toast.error('سجّل الدخول لحفظ الإعلان'); router.push(`${ROUTES.login}?from=${encodeURIComponent(detailHref)}`); return; }
    if (!isFavorited) setPopKey((k) => k + 1);
    toggleFavorite.mutate(ad.id);
  }

  return (
    <article className={cn('group relative h-full min-w-0', className)}>
      <Link href={detailHref} prefetch={false} onPointerEnter={warmDetail} onFocus={warmDetail} className={cn(CARD_SHELL, 'group/card flex flex-col transition-[transform,box-shadow,border-color] duration-200', 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', 'active:scale-[0.99]', ad.isFeatured && !isSold && 'border-accent/40')}>
        <div className={CARD_IMAGE_43}>
          <SafeImage src={thumb} alt={ad.title} fill className={cn('object-cover transition-transform duration-200 group-hover/card:scale-[1.02]', isSold && 'opacity-60')} sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" priority={priority} loading={priority ? undefined : 'lazy'} {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })} />
          <CardOfflineBadge />
          {isSold && <div className="absolute inset-0 z-[1] flex items-center justify-center bg-foreground/45"><span className="rounded-full bg-background/95 px-3 py-1 text-sm font-bold">مباع</span></div>}
          <div className="absolute start-2 top-2 z-10 flex max-w-[68%] flex-col items-start gap-1">
            {showKind && <CardKindBadge kind="ad" />}
            {ad.condition && <Badge size="xs" variant={ad.condition === 'NEW' ? 'overlay-success' : 'overlay'}>{CONDITION_LABELS[ad.condition] ?? ad.condition}</Badge>}
            {ad.isFeatured && !isSold && <Badge size="xs" variant="soft-accent">مميز ✨</Badge>}
          </div>
          {showHeart && <button type="button" onClick={handleFavoriteClick} disabled={toggleFavorite.isPending} aria-label={isFavorited ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'} aria-pressed={isFavorited} className={cn('absolute end-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-background/95 shadow-md backdrop-blur', HIT_AREA, 'transition-transform active:scale-90 disabled:opacity-60')}><Heart key={popKey} className={cn('h-4 w-4', popKey > 0 && 'motion-safe:animate-heart-pop', isFavorited ? 'fill-rating text-rating' : 'text-foreground/80')} /></button>}
        </div>
        <div className={compact ? CARD_BODY_COMPACT : CARD_BODY_DEFAULT}>
          <div className="flex min-h-6 flex-wrap items-baseline gap-1.5">
            <span dir="ltr" className={cn('font-mono font-bold tabular-nums tracking-tight', compact ? 'text-base' : 'text-lg', isSold ? 'text-muted-foreground line-through' : 'text-primary')}>{formatPrice(ad.price)}</span>
            {ad.isNegotiable && !isSold && <Badge size="xs" variant="soft">قابل للتفاوض</Badge>}
          </div>
          <h3 className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-snug text-foreground">{ad.title}</h3>
          <div className="mt-auto flex min-h-5 items-center gap-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">
            {showCity && <span className="truncate">{ad.city}</span>}
            {showSeller && <span className="truncate">{sellerName}</span>}
            {showTime && now !== null && <span className={cn('ms-auto shrink-0 whitespace-nowrap tabular-nums', timeColorClass)}>{formatRelativeTime(ad.createdAt, now)}</span>}
            {showTime && now === null && <span className="ms-auto shrink-0">{TIME_PLACEHOLDER}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
