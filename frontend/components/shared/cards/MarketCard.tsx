import type { ComponentType, ReactNode } from 'react';
import { MapPin, Star } from 'lucide-react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { CardOfflineBadge } from './CardOfflineBadge';
import { CardRelativeTime } from './CardRelativeTime';
import {
  CARD_BADGE_SUCCESS,
  CARD_BODY_DEFAULT,
  CARD_FOCUS,
  CARD_HOVER,
  CARD_IMAGE_43,
  CARD_IMAGE_HOVER,
  CARD_META_ITEM,
  CARD_MUTED_FOOTER,
  CARD_PRESS,
  CARD_SELLER_INITIAL,
  CARD_SHELL,
  CARD_TITLE_GRID,
  cardPlaceholderToneForId,
} from './cardTokens';
import {
  getListThumbnailUrl,
  getPlaceholderUrl,
  isCloudinaryUrl,
  PLACEHOLDER_SVG,
} from '@/lib/cloudinary';
import { cn } from '@/lib/utils';

export interface MarketCardProps {
  id: string;
  href: string;
  title: string;
  /** Raw (un-resized) first image URL; falsy → tinted placeholder with an icon. */
  imageSrc?: string | null;
  placeholderIcon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  priority?: boolean;

  /** Status pills stacked on the image (start corner). Already capped by the caller. */
  badges?: ReactNode[];
  /** Dim the image + show a centered overlay label (sold / out of stock). */
  dimmed?: boolean;
  overlayLabel?: string;
  /** Soft accent border (e.g. featured ad). */
  accent?: boolean;

  /** Price row. */
  price: string;
  /** True when no price was given: renders muted/small instead of a real price. */
  priceUnset?: boolean;
  /** Struck-through original price (discounts). */
  originalPrice?: string;
  /** Small note beside the price (e.g. قابل للتفاوض). */
  priceNote?: string;
  /** Small line under the price (e.g. wholesale hint). */
  priceSub?: string;
  /** `ltr` for numeric prices, `auto` when the label itself is Arabic text. */
  priceDir?: 'ltr' | 'auto';

  /** Seller / store / provider row. */
  ownerName?: string;
  ownerVerified?: boolean;
  rating?: number | null;

  /** Footer chips. */
  city?: string | null;
  createdAt?: string | null;
  extraMeta?: ReactNode;

  /** Favorite button (absolutely positioned by the caller). */
  heart?: ReactNode;
  className?: string;
}

function initialOf(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0) : 'م';
}

/**
 * One card for ads, products and services.
 *
 * Every content type now renders exactly the same slots in the same order:
 *   image (+badges, +overlay, +heart) → title → price → owner row → footer (city · time · extra)
 * Each caller only maps its own data onto these slots, so a slot can never
 * be "forgotten" for one type (the service card used to lack the owner
 * avatar, city, time and placeholder icon).
 *
 * Server-safe: the only client behaviour lives in the small CardOfflineBadge /
 * CardRelativeTime islands.
 */
export function MarketCard({
  id,
  href,
  title,
  imageSrc,
  placeholderIcon: PlaceholderIcon,
  priority = false,
  badges = [],
  dimmed = false,
  overlayLabel,
  accent = false,
  price,
  priceUnset = false,
  originalPrice,
  priceNote,
  priceSub,
  priceDir = 'ltr',
  ownerName,
  ownerVerified = false,
  rating,
  city,
  createdAt,
  extraMeta,
  heart,
  className,
}: MarketCardProps) {
  const thumb = imageSrc ? getListThumbnailUrl(imageSrc, 320, 240) : PLACEHOLDER_SVG;
  const blurDataURL = imageSrc && isCloudinaryUrl(imageSrc) ? getPlaceholderUrl(imageSrc) : undefined;
  const hasFooter = Boolean(city || createdAt || extraMeta);

  return (
    <article
      className={cn(
        'group relative h-full min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_300px]',
        className,
      )}
    >
      <IntentPrefetchLink
        href={href}
        prefetch={false}
        className={cn(
          CARD_SHELL,
          'group/card flex flex-col',
          CARD_HOVER,
          CARD_FOCUS,
          CARD_PRESS,
          accent && 'border-accent/40',
        )}
      >
        <div
          className={cn(
            CARD_IMAGE_43,
            'flex items-center justify-center',
            imageSrc ? 'bg-muted' : cardPlaceholderToneForId(id),
          )}
        >
          {imageSrc ? (
            <SafeImage
              src={thumb}
              alt={title}
              fill
              className={cn('object-cover', CARD_IMAGE_HOVER, dimmed && 'opacity-60')}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              priority={priority}
              loading={priority ? undefined : 'lazy'}
              {...(blurDataURL && { placeholder: 'blur' as const, blurDataURL })}
            />
          ) : (
            <PlaceholderIcon className="h-8 w-8 text-primary/50" aria-hidden={true} />
          )}
          <CardOfflineBadge />
          {dimmed && overlayLabel && (
            <div
              className="absolute inset-0 z-[1] flex items-center justify-center bg-foreground/40"
              aria-label={overlayLabel}
            >
              <span className="rounded-full bg-background/95 px-3 py-1 text-sm font-bold text-foreground">
                {overlayLabel}
              </span>
            </div>
          )}
          {badges.length > 0 && (
            <div className="absolute start-2 top-2 z-10 flex max-w-[calc(100%-3.5rem)] flex-col items-start gap-1">
              {badges}
            </div>
          )}
        </div>

        <div className={cn(CARD_BODY_DEFAULT, 'gap-1')}>
          <h3 title={title} className={cn(CARD_TITLE_GRID, 'break-words')}>
            {title}
          </h3>

          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span
              dir={priceDir}
              className={cn(
                'text-sm font-extrabold tabular-nums tracking-tight text-primary',
                priceUnset && 'text-xs font-bold text-muted-foreground',
                dimmed && 'text-muted-foreground line-through',
              )}
            >
              {price}
            </span>
            {originalPrice && (
              <span dir="ltr" className="text-xs tabular-nums text-muted-foreground line-through">
                {originalPrice}
              </span>
            )}
            {priceNote && (
              <span className="text-2xs font-semibold text-muted-foreground">{priceNote}</span>
            )}
          </div>
          {priceSub && (
            <p dir="auto" className="text-2xs-tight text-muted-foreground">
              {priceSub}
            </p>
          )}

          {ownerName && (
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs-tight text-muted-foreground">
              <span className={CARD_SELLER_INITIAL} aria-hidden>
                {initialOf(ownerName)}
              </span>
              <span className="min-w-0 truncate" title={ownerName}>
                {ownerName}
              </span>
              {ownerVerified && <span className={cn(CARD_BADGE_SUCCESS, 'shrink-0')}>✓ موثّق</span>}
              {rating != null && (
                <span className="ms-auto inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground">
                  <Star className="h-3 w-3 fill-rating text-rating" aria-hidden />
                  {Number(rating).toFixed(1)}
                </span>
              )}
            </span>
          )}

          {hasFooter && (
            <div className={CARD_MUTED_FOOTER}>
              {city && (
                <span className={CARD_META_ITEM}>
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{city}</span>
                </span>
              )}
              {extraMeta}
              {createdAt && <CardRelativeTime date={createdAt} />}
            </div>
          )}
        </div>
      </IntentPrefetchLink>
      {heart}
    </article>
  );
}
