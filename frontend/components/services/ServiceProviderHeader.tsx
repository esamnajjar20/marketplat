'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Star, Phone, MapPin, PlusCircle } from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { Button } from '@/components/shared/ui/Button';
import { ProviderBadges } from '@/components/services/ProviderBadges';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { getAvatarUrl } from '@/lib/cloudinary';
import { formatPhone } from '@/lib/formatters';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import type { ServiceProviderPublic, ServiceAvailability } from '@/types/service.types';

interface Props {
  provider: ServiceProviderPublic;
}

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

// FIX P2-3: see ServiceListingCard.tsx — same semantic-token swap,
// same three-state map duplicated across all three availability cards.
const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-success',
  BUSY: 'bg-warning',
  UNAVAILABLE: 'bg-muted-foreground',
};

/**
 * REDESIGN: same mock StoreHeader.tsx was rebuilt against — centered
 * avatar with a verified badge on it, name, stats card, full-width call
 * button, centered bio. A provider has no cover photo or follow
 * relationship (that's a store concept), so those are omitted; the
 * stats card uses what a provider actually has (rating / service
 * areas / availability) instead of a store's (followers/products/
 * city). Same data as before — only the layout changed.
 */
export function ServiceProviderHeader({ provider }: Props) {
  const currentUser = useAuthStore(selectUser);
  const isOwnProvider = currentUser?.id === provider.sellerProfile.userId;
  const avatar = getAvatarUrl(provider.logoUrl ?? provider.sellerProfile.avatarUrl ?? '', 128);
  const rating = parseFloat(provider.sellerProfile.averageRating);

  return (
    <div className="flex flex-col w-full items-center text-center pt-6">
      <div className="relative w-24 h-24 rounded-full bg-background p-1 shadow-md">
        <div className="relative w-full h-full rounded-full overflow-hidden bg-muted">
          <SafeImage variant="avatar" src={avatar} alt={provider.businessName} fill className="object-cover" sizes="96px" />
        </div>
        {provider.sellerProfile.verified && <VerifiedBadge />}
      </div>

      <h1 className="mt-4 text-xl font-bold text-foreground">{provider.businessName}</h1>

      <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
        <span className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[provider.availabilityStatus]}`} />
        {AVAILABILITY_LABEL[provider.availabilityStatus]}
      </span>

      {provider.sellerProfile.totalRatings > 0 && (
        <span className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
          <Star className="h-4 w-4 fill-rating text-rating" />
          {rating.toFixed(1)} ({provider.sellerProfile.totalRatings} تقييم)
        </span>
      )}

      {/* BADGES: same placement convention as StoreHeader's own
          StoreBadges — right under the rating/availability line so
          they read as part of the provider's identity summary, before
          the stats card. */}
      <ProviderBadges providerId={provider.id} className="mt-2" />

      {/* Stats card */}
      <div className="mt-4 w-full max-w-sm bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex justify-around items-center">
          <div className="flex flex-col items-center">
            <MapPin className="h-5 w-5 text-primary mb-1" />
            <span className="text-xs text-muted-foreground">{provider.serviceAreaCities.join('، ')}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 w-full max-w-sm">
        <a
          href={`tel:${provider.contactPhone}`}
          className="w-full bg-primary text-primary-foreground rounded-full py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium shadow-md transition-transform active:scale-95"
        >
          <Phone className="h-4 w-4" /> {formatPhone(provider.contactPhone)}
        </a>
      </div>

      {/* FEAT-MSG-UNIFY: "مراسلة مقدم الخدمة" — same unified messaging
          entry point (MessageUserButtonGate) as StoreHeader's "مراسلة
          المتجر" and ProductDetail's "راسل المتجر", targeting the
          provider's owner user. Reuses whatever thread already exists
          for this owner from an ad, profile, store, or another service
          — never a provider-specific conversation. Self-hides on the
          owner's own provider page, so no isOwnProvider guard needed. */}
      <div className="mt-3 w-full max-w-sm">
        <MessageUserButtonGate
          targetUserId={provider.sellerProfile.userId}
          size="lg"
          variant="outline"
          label="مراسلة مقدم الخدمة"
          className="w-full rounded-full py-3 h-auto gap-2 font-medium"
        />
      </div>

      {/*
        FEAT-PROVIDER-PUBLISH-AD: same entry-point-only pattern as
        StoreHeader's "نشر إعلان" button — the ad stays
        Ad.sellerProfileId (SellerProfile), never a
        ServiceProviderDetails-owned column; there is no such column.
        This is a UX shortcut into the existing /ads/create route +
        CreateAdGate, not a new ownership model.

        Deliberately gated on isOwnProvider only — no
        availabilityStatus check. availabilityStatus (AVAILABLE/BUSY/
        UNAVAILABLE) reflects booking availability for service
        requests, not account standing or approval state; it has no
        bearing on whether this seller may publish an ad. Unlike
        StoreHeader's store.status === 'ACTIVE' check,
        ServiceProviderDetails has no equivalent approval-status field
        to gate on here.
      */}
      {isOwnProvider && (
        <div className="mt-3 w-full max-w-sm">
          <Button asChild variant="outline" className="w-full rounded-full py-3 h-auto gap-2">
            <Link href={ROUTES.adCreate}>
              <PlusCircle className="h-4 w-4" />
              نشر إعلان
            </Link>
          </Button>
        </div>
      )}

      <p className="mt-6 text-sm text-muted-foreground text-center max-w-[280px]">
        {provider.description}
      </p>
    </div>
  );
}
