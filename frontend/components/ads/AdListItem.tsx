import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Eye, Calendar } from 'lucide-react';
import { ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import type { AdListItem as AdListItemType } from '@/types/ad.types';
import { cn } from '@/lib/utils';

interface Props { ad: AdListItemType; className?: string; }

export function AdListItem({ ad, className }: Props) {
  const thumb = ad.images[0] ? getThumbnailUrl(ad.images[0], 160, 120) : PLACEHOLDER_SVG;

  return (
    <Link href={ROUTES.adDetail(ad.id)}
      className={cn('flex gap-3 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow', className)}>
      <div className="relative w-28 h-20 shrink-0 rounded overflow-hidden bg-muted">
        <Image src={thumb} alt={ad.title} fill className="object-cover" sizes="112px" />
        {ad.status === 'SOLD' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-xs font-bold">تم البيع</div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="font-medium text-sm line-clamp-2">{ad.title}</h3>
        <p className="text-primary font-bold">{formatPrice(ad.price)}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{ad.city}</span>
          {ad.condition && <span>{CONDITION_LABELS[ad.condition] ?? ad.condition}</span>}
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{ad.views}</span>
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatRelativeTime(ad.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
