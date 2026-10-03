'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { useRouter } from 'next/navigation';
import { MessageSquare, Star } from 'lucide-react';
import { VerifiedBadge } from '@/components/shared/VerifiedBadge';
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

interface StoreBrief {
  id: string;
  name: string;
  slug?: string | null;
  logoUrl?: string | null;
}

interface Props {
  seller: AdAuthor;
  adId: string;
  sellerProfileId: string | null;
  /** إن وُجد: نفس البطاقة تمامًا لكن الهوية الظاهرة = المتجر */
  store?: StoreBrief | null;
}

export function SellerCard({ seller, adId, sellerProfileId, store }: Props) {
  const router = useRouter();
  const isAuth = useAuthStore(selectIsAuthenticated);
  const currentUser = useAuthStore(selectUser);
  const isStoreAd = Boolean(store?.id);
  const avatar = isStoreAd
    ? getAvatarUrl(store?.logoUrl ?? '', 64)
    : getAvatarUrl(seller.avatarUrl ?? '', 64);
  const displayName = isStoreAd ? store!.name : seller.name;
  // ثقة البائع فقط للإعلان الشخصي
  const { data: sellerProfile } = useSellerProfile(
    !isStoreAd && sellerProfileId ? sellerProfileId : ''
  );
  const startConversation = useStartConversation();

  const profileHref = isStoreAd
    ? `/stores/${store!.slug || store!.id}`
    : ROUTES.userProfile(seller.id);

  const isOwnAd = currentUser?.id === seller.id;

  function handleMessage() {
    // SW-FIX-SELLERCARD-LOGIN: same pattern — send to login with the
    // current ad as the return target. Was a bare toast.
    if (!isAuth) {
      toast.error('سجّل الدخول لمراسلة البائع');
      router.push(`${ROUTES.login}?from=${encodeURIComponent(ROUTES.adDetail(adId))}`);
      return;
    }
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
      <h3 className="font-semibold">{isStoreAd ? 'معلومات المتجر' : 'معلومات البائع'}</h3>

      <Link href={profileHref} className="flex items-center gap-4 hover:opacity-80 transition-opacity">
        <div className="relative shrink-0">
          <div className="relative w-16 h-16 rounded-full overflow-hidden bg-muted">
            <SafeImage variant="avatar" src={avatar} alt={displayName} fill className="object-cover" sizes="64px" />
          </div>
          {!isStoreAd && sellerProfile?.verified && (
            <VerifiedBadge className="-bottom-1 -end-1 border-card" size="md" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{displayName}</p>
          {!isStoreAd && seller.city && <p className="text-sm text-muted-foreground">{seller.city}</p>}
          {/* FIX UX-13: sellerProfile is already fetched above for the
              verified check — it also carries averageRating/totalRatings,
              the same fields SellerProfileHeader uses, so surface them
              here too instead of leaving this highest-trust-moment card
              (right where a buyer decides whether to message the seller)
              without a rating. */}
          {!isStoreAd && sellerProfile && sellerProfile.totalRatings > 0 && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
              <Star className="h-3.5 w-3.5 fill-rating text-rating" />
              {parseFloat(sellerProfile.averageRating).toFixed(1)} ({sellerProfile.totalRatings} تقييم)
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
          {startConversation.isPending ? 'جارٍ التحضير…' : (isStoreAd ? 'مراسلة' : 'مراسلة البائع')}
        </Button>
      )}

      <StorePaymentMethods
        paymentMethods={(sellerProfile as { paymentMethods?: unknown } | undefined)?.paymentMethods}
        entityName={displayName}
        fallbackName={displayName}
        className="mt-2"
      />

    </div>
  );
}
