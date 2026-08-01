'use client';

import { useState } from 'react';
import Image from 'next/image';
import { MapPin, Eye, Calendar, Tag, ChevronRight, ChevronLeft, Heart } from 'lucide-react';
import { Button }     from '@/components/shared/ui/Button';
import { Badge }      from '@/components/shared/ui/Badge';
import { SellerCard } from '@/components/ads/SellerCard';
import { ReportAdButton } from '@/components/ads/ReportAdButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ROUTES, CONDITION_LABELS, STATUS_LABELS } from '@/lib/constants';
import { formatPrice, formatDate } from '@/lib/formatters';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import Link from 'next/link';
import type { Ad } from '@/types/ad.types';
import { cn } from '@/lib/utils';

interface Props { ad: Ad; isFavorited?: boolean; }

export function AdDetail({ ad, isFavorited = false }: Props) {
  const [imgIdx,    setImgIdx]    = useState(0);
  const [favorited, setFavorited] = useState(isFavorited);
  const isAuth = useAuthStore(selectIsAuthenticated);
  const toggleFavorite = useToggleFavorite();

  const images = ad.images.length > 0 ? ad.images : [PLACEHOLDER_SVG];
  const currentImg = getDetailImageUrl(images[imgIdx] ?? PLACEHOLDER_SVG);

  function handleFavorite() {
    if (!isAuth) { toast.error('يرجى تسجيل الدخول أولاً'); return; }
    setFavorited((p) => !p);
    toggleFavorite.mutate(ad.id, {
      onError: () => setFavorited((p) => !p),
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LEFT: images + details */}
      <div className="lg:col-span-2 space-y-4">

        {/* Gallery */}
        <div className="space-y-2">
          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted">
            <Image src={currentImg} alt={ad.title} fill className="object-contain" sizes="(max-width:1024px) 100vw, 66vw" priority />
            {images.length > 1 && (
              <>
                <button onClick={() => setImgIdx((i) => Math.max(0, i - 1))}
                  disabled={imgIdx === 0}
                  aria-label="الصورة السابقة"
                  className="absolute start-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30">
                  <ChevronRight className="h-5 w-5" />
                </button>
                <button onClick={() => setImgIdx((i) => Math.min(images.length - 1, i + 1))}
                  disabled={imgIdx === images.length - 1}
                  aria-label="الصورة التالية"
                  className="absolute end-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white disabled:opacity-30">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="absolute bottom-2 end-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                  {imgIdx + 1} / {images.length}
                </span>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
                  aria-label={`عرض الصورة ${i + 1} من ${images.length}`}
                  aria-current={i === imgIdx ? 'true' : undefined}
                  className={cn('relative w-16 h-12 rounded shrink-0 overflow-hidden border-2 transition-colors',
                    i === imgIdx ? 'border-primary' : 'border-transparent')}>
                  {/* FIX PERF-07: was rendering the raw, full-resolution
                      Cloudinary URL at a 64x48 display size — every
                      thumbnail downloaded the same multi-MB original as
                      the main image, just CSS-scaled down visually. A
                      real Cloudinary-transformed thumbnail costs a
                      fraction of the bytes for a strip that never
                      displays larger than 64px wide. */}
                  <Image src={getThumbnailUrl(img, 128, 96)} alt={`صورة ${i + 1}`} fill className="object-cover" sizes="64px" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title + price */}
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-bold leading-snug">{ad.title}</h1>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={handleFavorite} aria-label="حفظ">
                <Heart className={cn('h-5 w-5', favorited && 'fill-destructive text-destructive')} />
              </Button>
              <ShareAdButton title={ad.title} />
            </div>
          </div>

          <p className="text-2xl font-bold text-primary">
            {formatPrice(ad.price)}
            {ad.isNegotiable && <span className="text-sm font-normal text-muted-foreground ms-2">قابل للتفاوض</span>}
          </p>

          <div className="flex flex-wrap gap-2">
            {ad.status !== 'ACTIVE' && (
              <Badge variant={ad.status === 'SOLD' ? 'secondary' : 'destructive'}>
                {STATUS_LABELS[ad.status] ?? ad.status}
              </Badge>
            )}
            {ad.isFeatured && <Badge variant="outline" className="border-warning text-warning">مميز</Badge>}
            {ad.condition && <Badge variant="outline">{CONDITION_LABELS[ad.condition] ?? ad.condition}</Badge>}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{ad.city}</span>
            <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{ad.views} مشاهدة</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{formatDate(ad.createdAt)}</span>
            {ad.category && (
              <Link href={ROUTES.category(ad.category.id)} className="flex items-center gap-1.5 hover:text-primary">
                <Tag className="h-4 w-4" />{ad.category.nameAr}
              </Link>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h2 className="font-semibold">تفاصيل الإعلان</h2>
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{ad.description}</p>
        </div>

        {/* Report link */}
        <div className="flex justify-end">
          <ReportAdButton adId={ad.id} />
        </div>
      </div>

      {/* RIGHT: seller + action */}
      <div className="space-y-4">
        <SellerCard seller={ad.user} adId={ad.id} sellerProfileId={ad.sellerProfileId} />
        <div className="rounded-lg border bg-card p-4 text-xs text-muted-foreground space-y-1">
          <p>رقم الإعلان: <span className="font-mono text-foreground">{ad.id.slice(-8)}</span></p>
          <p>تاريخ النشر: {formatDate(ad.createdAt)}</p>
          <p>آخر تحديث: {formatDate(ad.updatedAt)}</p>
        </div>
      </div>
    </div>
  );
}
