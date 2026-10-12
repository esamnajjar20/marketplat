import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';
import { memo } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Eye, Calendar, Store, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { formatPrice } from '@/lib/formatters';
import { CARD_PRICE_UNSET } from '@/components/shared/cards/cardTokens';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import type { AdListItem as AdListItemType } from '@/types/ad.types';
import { cn } from '@/lib/utils';

interface Props { ad: AdListItemType; className?: string; }

export const AdListItem = memo(function AdListItem({ ad, className }: Props) {
  const thumb = ad.images?.[0] ? getThumbnailUrl(ad.images[0], 240, 180) : PLACEHOLDER_SVG;
  const isSold = ad.status === 'SOLD';

  return (
    <Link href={ROUTES.adDetail(ad.id)}
      prefetch={false}
      className={cn('group flex min-w-0 gap-3 rounded-2xl border border-border/70 bg-card p-2.5 shadow-card transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-4 sm:p-3 [content-visibility:auto] [contain-intrinsic-size:auto_140px]', className)}>
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-28 sm:w-36">
        <SafeImage src={thumb} alt={ad.title} fill className="object-cover" sizes="(max-width: 640px) 96px, 144px" />
        {isSold && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"><span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold">تم البيع</span></div>
        )}
        {!isSold && ad.isFeatured && <Badge size="xs" variant="soft-accent" className="absolute start-1.5 top-1.5">مميز</Badge>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <h3 title={ad.title} className="line-clamp-2 text-sm font-bold leading-5 text-foreground sm:text-base">{ad.title}</h3>
        <p className={cn("font-mono text-base font-bold tabular-nums sm:text-lg", isSold ? "text-muted-foreground line-through" : "text-primary")}>{ad.price == null ? CARD_PRICE_UNSET : formatPrice(ad.price)}</p>
        <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-border/50 pt-2 text-xs text-muted-foreground">
          {ad.city && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="max-w-32 truncate">{ad.city}</span></span>}
          {ad.condition && <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3 shrink-0" aria-hidden />{CONDITION_LABELS[ad.condition] ?? ad.condition}</span>}
          {ad.store?.name && <span className="inline-flex min-w-0 items-center gap-1"><Store className="h-3 w-3 shrink-0" aria-hidden /><span className="max-w-32 truncate">{ad.store.name}</span></span>}
          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3 shrink-0" aria-hidden />{ad.views}</span>
          <span className="inline-flex shrink-0 items-center gap-1"><Calendar className="h-3 w-3 shrink-0" aria-hidden /><HydrationSafeRelativeTime date={ad.createdAt} /></span>
        </div>
      </div>
    </Link>
  );
});
