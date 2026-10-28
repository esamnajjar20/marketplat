'use client';

import { memo, useEffect, useState } from 'react';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, MessageCircle } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { cn } from '@/lib/utils';
import { CARD_SHELL_SOFT, CARD_AVATAR_FALLBACK, CARD_BADGE_SUCCESS } from '@/components/shared/cards/cardTokens';
import { formatDistanceKm } from '@/lib/distance';
import { useAuthStore } from '@/store/auth.store';
import type { ServiceProviderDetails, ServiceAvailability } from '@/types/service.types';

interface Props {
  provider: Omit<ServiceProviderDetails, 'latitude' | 'longitude'> & {
    distanceKm?: number;
    sellerProfile?: {
      verified?: boolean;
      averageRating?: string | number | null;
      totalRatings?: number | null;
      userId?: string;
    };
    serviceTypes?: { nameAr?: string; name?: string }[];
  };
  className?: string;
}

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

function initial(name: string) {
  const t = name.trim();
  return t ? t.charAt(0) : 'م';
}

/**
 * بطاقة مقدّم خدمة — مطابقة لتصميم المرجع (أفاتار حرف، حالة، أزرار).
 */
export const ServiceProviderCard = memo(function ServiceProviderCard({ provider, className }: Props) {
  const avatar = getAvatarUrl(provider.logoUrl ?? '', 96);
  const hasLogo = Boolean(provider.logoUrl);
  const persistedUserCity = useAuthStore((s) => s.user?.city ?? null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const userCity = mounted ? persistedUserCity : null;

  const distanceLabel = formatDistanceKm(provider.distanceKm);
  const sharedCity =
    distanceLabel === null && userCity
      ? provider.serviceAreaCities.find((city) => city === userCity)
      : null;

  const avail = provider.availabilityStatus;
  const verified = provider.sellerProfile?.verified;
  const rating = provider.sellerProfile?.averageRating;
  const totalRatings = provider.sellerProfile?.totalRatings;
  const profileHref = ROUTES.serviceProvider(provider.id);
  const skills = (provider.serviceTypes ?? []).slice(0, 3);

  return (
    <article
      className={cn(
        cn(CARD_SHELL_SOFT, 'p-3 sm:p-3.5 [content-visibility:auto] [contain-intrinsic-size:auto_280px]'),
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("relative h-11 w-11 shrink-0 overflow-hidden rounded-full sm:h-12 sm:w-12", CARD_AVATAR_FALLBACK)}>
          {hasLogo ? (
            <SafeImage variant="avatar" src={avatar} alt={provider.businessName} fill className="object-cover" sizes="48px" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-extrabold" aria-hidden>
              {initial(provider.businessName)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-extrabold text-foreground">{provider.businessName}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {rating != null && rating !== '' ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-foreground">
                    <span className="text-amber-500" aria-hidden>
                      ★
                    </span>
                    {Number(rating).toFixed(1)}
                    {totalRatings != null ? (
                      <span className="font-normal text-muted-foreground">({totalRatings})</span>
                    ) : null}
                  </span>
                ) : null}
                {verified ? (
                  <span className={CARD_BADGE_SUCCESS}>
                    ✓ موثّق
                  </span>
                ) : null}
              </div>
            </div>
            <span
              className={cn(
                'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-bold',
                avail === 'AVAILABLE' && 'bg-[#E8F1EC] text-[#1F4D33]',
                avail === 'BUSY' && 'bg-[#FBF0D9] text-[#7A4B07]',
                avail === 'UNAVAILABLE' && 'bg-muted text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  avail === 'AVAILABLE' && 'bg-[#397F56]',
                  avail === 'BUSY' && 'bg-amber-500',
                  avail === 'UNAVAILABLE' && 'bg-muted-foreground',
                )}
              />
              {AVAILABILITY_LABEL[avail]}
            </span>
          </div>

          {skills.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {skills.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex h-6 items-center rounded-full bg-[#F6F1E7] px-2 text-[11px] font-bold text-[#4A433A]"
                >
                  {s.nameAr || s.name}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {distanceLabel
                ? distanceLabel
                : sharedCity
                  ? sharedCity
                  : provider.serviceAreaCities.length > 0
                    ? provider.serviceAreaCities.join('، ')
                    : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={profileHref}
          prefetch={false}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-[#397F56] px-3 text-sm font-bold text-white transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          عرض الملف
        </Link>
        <Link
          href={profileHref}
          prefetch={false}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#EAE3D6] bg-white px-3 text-sm font-bold text-[#1F4D33] transition-colors hover:border-primary/40 dark:border-border dark:bg-card dark:text-primary"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          تواصل
        </Link>
      </div>
    </article>
  );
});
