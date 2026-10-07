'use client';

import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Calendar, FileText, Star } from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { getAvatarUrl }   from '@/lib/cloudinary';
import { formatDate }     from '@/lib/formatters';
import { useIsUserOnline } from '@/hooks/queries/usePresence';
import { ReportUserButtonGate } from '@/components/profile/ReportUserButtonGate';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { EditProfileButtonGate } from '@/components/profile/EditProfileButtonGate';
import { BlockUserButtonGate } from '@/components/profile/BlockUserButtonGate';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ProfileBadges } from '@/components/profile/ProfileBadges';
import { useMemo } from 'react';
import type { PublicUser } from '@/types/user.types';
import { APP_URL, ROUTES } from '@/lib/constants';
import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';
import { normalizePaymentMethods, type StorePaymentMethod } from '@/lib/storePaymentMethods';

interface Props { user: PublicUser; }

/**
 * REDESIGN: matches the same mock StoreHeader.tsx was rebuilt against —
 * centered avatar, name, a stats card, centered bio. A plain user has no
 * cover photo or follow relationship the way a store does, so those
 * pieces of the mock are simply omitted here rather than faked; the
 * stats card uses what a profile actually has (ad count / city /
 * member-since) in place of store's (followers/products/city).
 *
 * UNIFIED-PROFILE: this is now the single entry point for a person
 * regardless of whether they're also a seller/store-owner/service-
 * provider (see /profile/[id]/page.tsx's ProfileTabsSection for the
 * per-role tab content) — the header itself only surfaces the verified
 * badge + aggregate rating a seller profile carries, since a store's
 * own name/logo/cover and a service provider's own business name stay
 * inside their respective tabs rather than replacing this header's
 * identity (this is the *person's* name, not the store's).
 */
export function PublicProfileHeader({ user }: Props) {
  const avatar = getAvatarUrl(user.avatarUrl ?? '', 128);
  const seller = user.sellerProfile;
  const rating = seller ? parseFloat(seller.averageRating) : 0;
  const isOnline = useIsUserOnline(user.id);

  const profilePaymentMethods = useMemo(() => {
    const seller = user.sellerProfile;
    if (!seller) return [] as StorePaymentMethod[];
    // UNIFY-PAYMENTS-STORES: storeDetails no longer has its own
    // paymentMethods either (see ServiceProviderDetails' identical
    // comment above from the original UNIFY-PAYMENTS pass) — both a
    // service provider's and a store's numbers are now always just
    // seller.paymentMethods, so the old merge/dedup across seller +
    // storeDetails is gone; nothing left to merge.
    return normalizePaymentMethods((seller as { paymentMethods?: unknown }).paymentMethods);
  }, [user.sellerProfile]);

  const fallbackPhone =
    user.sellerProfile?.serviceProviderDetails?.contactPhone ||
    (user.sellerProfile?.storeDetails as { phone?: string } | null | undefined)?.phone ||
    undefined;

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 pb-5 pt-7 shadow-sm">
      <div className="relative z-10 flex flex-col items-center px-4 text-center">
        <div className="relative shrink-0">
          <div className="relative h-[5.5rem] w-[5.5rem] overflow-hidden rounded-full border-[3px] border-background bg-muted shadow-md sm:h-24 sm:w-24">
            <SafeImage variant="avatar" src={avatar} alt={user.name} fill className="object-cover" sizes="96px" />
          </div>
          {seller?.verified && (
            <div className="absolute -bottom-0.5 -end-0.5 z-10">
              <VerifiedBadge />
            </div>
          )}
          {isOnline && (
            <span
              className="absolute bottom-0.5 end-0.5 z-10 h-3.5 w-3.5 rounded-full bg-online ring-2 ring-background"
              aria-label="متصل الآن"
              title="متصل الآن"
            />
          )}
        </div>

        <h1 className="mt-3.5 text-lg font-bold text-foreground sm:text-xl">{user.name}</h1>

        <ProfileBadges sellerProfile={seller} className="mt-2" />

        {seller && seller.totalRatings > 0 && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <Star className="h-4 w-4 fill-rating text-rating" />
            {rating.toFixed(1)} ({seller.totalRatings} تقييم)
          </span>
        )}

        {/* Stats card */}
        <div className="mt-4 w-full max-w-sm rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
          <div className="flex justify-around items-center">
            <div className="flex flex-col items-center">
              <FileText className="mb-1 h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-semibold tabular-nums text-foreground">{user._count.ads}</span>
              <span className="text-2xs-tight text-muted-foreground">إعلان</span>
            </div>
            {user.city && (
              <>
                <div className="w-px h-8 bg-border" />
                <div className="flex flex-col items-center">
                  <MapPin className="mb-1 h-4 w-4 text-muted-foreground" />
                  <span className="text-2xs-tight text-muted-foreground">{user.city}</span>
                </div>
              </>
            )}
            <div className="w-px h-8 bg-border" />
            <div className="flex flex-col items-center">
              <Calendar className="mb-1 h-4 w-4 text-muted-foreground" />
              <span className="text-2xs-tight text-muted-foreground">عضو منذ {formatDate(user.createdAt)}</span>
            </div>
          </div>
        </div>

        {user.bio && (
          <p className="mt-5 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">{user.bio}</p>
        )}

        {/* FEAT-REPORT-USER-STORE / FEAT-BLOCK-FROM-PROFILE: message,
            block, and report gate themselves on the viewer (via
            useAuthStore) — only show on someone else's profile; edit
            only shows on your own. */}
        <div className="mt-4 w-full max-w-sm space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <MessageUserButtonGate targetUserId={user.id} />
            <ShareAdButton
              title={user.name}
              url={`${APP_URL}${ROUTES.userProfile(user.id)}`}
              variant="button"
            />
            <EditProfileButtonGate targetUserId={user.id} />
          </div>
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <BlockUserButtonGate targetUserId={user.id} targetUserName={user.name} />
            <ReportUserButtonGate targetUserId={user.id} />
          </div>
        </div>

        {(profilePaymentMethods.length > 0 || !!fallbackPhone) && (
          <div className="mt-3 w-full max-w-sm">
            <StorePaymentMethods
              paymentMethods={profilePaymentMethods}
              entityName={user.name}
              fallbackName={user.name}
              fallbackPhone={fallbackPhone}
            />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
