import { SafeImage } from '@/components/shared/ui/SafeImage';
import { MapPin, Calendar, FileText, Star } from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
import { getAvatarUrl }   from '@/lib/cloudinary';
import { formatDate }     from '@/lib/formatters';
import { ReportUserButtonGate } from '@/components/profile/ReportUserButtonGate';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { EditProfileButtonGate } from '@/components/profile/EditProfileButtonGate';
import { BlockUserButtonGate } from '@/components/profile/BlockUserButtonGate';
import { ProfileBadges } from '@/components/profile/ProfileBadges';
import type { PublicUser } from '@/types/user.types';

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

  return (
    <div className="flex flex-col w-full items-center text-center pt-6">
      <div className="relative w-24 h-24 rounded-full bg-background p-1 shadow-md">
        <div className="relative w-full h-full rounded-full overflow-hidden bg-muted">
          <SafeImage variant="avatar" src={avatar} alt={user.name} fill className="object-cover" sizes="96px" />
        </div>
        {seller?.verified && <VerifiedBadge />}
      </div>

      <h1 className="mt-4 text-xl font-bold text-foreground">{user.name}</h1>

      <ProfileBadges sellerProfile={seller} className="mt-2" />

      {seller && seller.totalRatings > 0 && (
        <span className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
          <Star className="h-4 w-4 fill-rating text-rating" />
          {rating.toFixed(1)} ({seller.totalRatings} تقييم)
        </span>
      )}

      {/* Stats card */}
      <div className="mt-4 w-full max-w-sm bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex justify-around items-center">
          <div className="flex flex-col items-center">
            <FileText className="h-5 w-5 text-primary mb-1" />
            <span className="text-xl font-semibold text-foreground">{user._count.ads}</span>
            <span className="text-xs text-muted-foreground">إعلان</span>
          </div>
          {user.city && (
            <>
              <div className="w-px h-8 bg-border" />
              <div className="flex flex-col items-center">
                <MapPin className="h-5 w-5 text-primary mb-1" />
                <span className="text-xs text-muted-foreground">{user.city}</span>
              </div>
            </>
          )}
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-center">
            <Calendar className="h-5 w-5 text-primary mb-1" />
            <span className="text-xs text-muted-foreground">عضو منذ {formatDate(user.createdAt)}</span>
          </div>
        </div>
      </div>

      {user.bio && (
        <p className="mt-6 text-sm text-muted-foreground text-center max-w-[280px]">{user.bio}</p>
      )}

      {/* FEAT-REPORT-USER-STORE / FEAT-BLOCK-FROM-PROFILE: PublicProfileHeader
          itself has no 'use client' — these are client components that
          hide/show themselves based on the viewer (via useAuthStore):
          message, block, and report only show on someone else's profile,
          edit only shows on your own. */}
      <div className="mt-3 flex items-center gap-2">
        <MessageUserButtonGate targetUserId={user.id} />
        <EditProfileButtonGate targetUserId={user.id} />
        <BlockUserButtonGate targetUserId={user.id} targetUserName={user.name} />
        <ReportUserButtonGate targetUserId={user.id} />
      </div>
    </div>
  );
}
