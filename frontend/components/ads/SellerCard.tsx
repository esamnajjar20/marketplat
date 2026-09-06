'use client';

import { ResponseTimeBadge } from '@/components/sellers/ResponseTimeBadge';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { useRouter } from 'next/navigation';
import { MessageSquare, BadgeCheck, Star } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { useSellerProfile } from '@/hooks/queries/useSellers';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { track } from '@/lib/analytics';
import { toast } from 'sonner';
import type { AdAuthor } from '@/types/ad.types';
import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';

interface Props { seller: AdAuthor; adId: string; sellerProfileId: string | null; }

// sellerProfileId: most ads have one — see seller-profile-design.md §8,
// ad creation is gated on the author owning a SellerProfile. It can
// still be null for ads created before that system shipped, in which
// case this card falls back to linking the plain user profile instead
// of the seller page.
export function SellerCard({ seller, adId, sellerProfileId }: Props) {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const avatar = getAvatarUrl(seller.avatarUrl ?? '', 64);
  // Only fetches when there's actually a profile to show trust info for —
  // avoids a wasted request/loading flicker on legacy ads with no seller.
  const { data: sellerProfile } = useSellerProfile(sellerProfileId ?? '');
  const startConversation = useStartConversation();

  // UNIFIED-PROFILE: previously branched to ROUTES.sellerProfile(id)
  // (the old /sellers/[id] standalone page) when a seller profile
  // existed. Now that /sellers/[id] is just a redirect back to
  // /profile/[userId] (see that page's own comment), linking straight
  // to the person's profile always works and saves the extra hop —
  // seller.id (AdAuthor.id) is the User.id in both branches anyway.
  const profileHref = ROUTES.userProfile(seller.id);

  // Epic 5: the backend rejects this as CANNOT_MESSAGE_SELF anyway, but
  // hiding the button for the ad's own owner avoids the round trip and
  // the confusing error for the one case where it can never succeed.
  const isOwnAd = currentUser?.id === seller.id;

  function handleMessage() {
    if (!isAuth) { toast.error('يرجى تسجيل الدخول أولاً'); return; }
    // Gap #7 (product analytics): the search→contact conversion metric
    // is defined off this event (see backend's
    // analyticsRepository.searchToContactSessions) — tracked on the
    // click itself, not the mutation's onSuccess, so it reflects real
    // buyer intent even if the conversation creation call itself fails.
    track('CONTACT_CLICK', { adId, sellerId: seller.id });
    startConversation.mutate(
      { adId },
      { onSuccess: (conversation) => router.push(ROUTES.conversationDetail(conversation!.id)) }
    );
  }

  return (
    <div className="rounded-2xl bg-card shadow-md p-6 space-y-5">
      <h3 className="font-semibold">معلومات البائع</h3>

      <Link href={profileHref} className="flex items-center gap-4 hover:opacity-80 transition-opacity">
        <div className="relative shrink-0">
          <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted">
            <SafeImage variant="avatar" src={avatar} alt={seller.name} fill className="object-cover" sizes="64px" />
          </div>
          {sellerProfile?.verified && (
            <div className="absolute -bottom-1 -end-1 bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center border-2 border-card" title="حساب موثق">
              <BadgeCheck className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{seller.name}</p>
          {seller.city && <p className="text-sm text-muted-foreground">{seller.city}</p>}
          {/* FIX UX-13: sellerProfile is already fetched above for the
              verified check — it also carries averageRating/totalRatings,
              the same fields SellerProfileHeader uses, so surface them
              here too instead of leaving this highest-trust-moment card
              (right where a buyer decides whether to message the seller)
              without a rating. */}
          {sellerProfile && sellerProfile.totalRatings > 0 && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
              <Star className="h-3.5 w-3.5 fill-rating text-rating" />
              {parseFloat(sellerProfile.averageRating).toFixed(1)} ({sellerProfile.totalRatings} تقييم)
              <ResponseTimeBadge
                responseTimeMinutes={sellerProfile.responseTimeMinutes}
                responseRate={sellerProfile.responseRate != null ? Number(sellerProfile.responseRate) : null}
                className="mt-1 block"
              />
            </span>
          )}
        </div>
      </Link>

      {!isOwnAd && (
        <Button
          variant="default"
          size="lg"
          className="w-full gap-2 rounded-xl"
          disabled={startConversation.isPending}
          onClick={handleMessage}
        >
          <MessageSquare className="h-4 w-4" />
          {startConversation.isPending ? 'جارٍ التحضير…' : 'مراسلة البائع'}
        </Button>
      )}

      <StorePaymentMethods
        paymentMethods={(sellerProfile as { paymentMethods?: unknown } | undefined)?.paymentMethods}
        entityName={seller.name}
        fallbackName={seller.name}
        className="mt-2"
      />

    </div>
  );
}
