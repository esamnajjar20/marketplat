'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MessageSquare, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { useSellerProfile } from '@/hooks/queries/useSellers';
import { useStartConversation } from '@/hooks/mutations/useConversationMutations';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import type { AdAuthor } from '@/types/ad.types';

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

  const profileHref = sellerProfileId
    ? ROUTES.sellerProfile(sellerProfileId)
    : ROUTES.userProfile(seller.id);

  // Epic 5: the backend rejects this as CANNOT_MESSAGE_SELF anyway, but
  // hiding the button for the ad's own owner avoids the round trip and
  // the confusing error for the one case where it can never succeed.
  const isOwnAd = currentUser?.id === seller.id;

  function handleMessage() {
    if (!isAuth) { toast.error('يرجى تسجيل الدخول أولاً'); return; }
    startConversation.mutate(
      { adId },
      { onSuccess: (conversation) => router.push(ROUTES.conversationDetail(conversation!.id)) }
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">البائع</h3>

      <Link href={profileHref} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <div className="relative w-12 h-12 rounded-full overflow-hidden bg-muted shrink-0">
          <Image src={avatar} alt={seller.name} fill className="object-cover" sizes="48px" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-medium">{seller.name}</p>
            {sellerProfile?.verified && (
              <Badge className="gap-1 text-xs">
                <BadgeCheck className="h-3 w-3" /> موثّق
              </Badge>
            )}
          </div>
          {seller.city && <p className="text-sm text-muted-foreground">{seller.city}</p>}
        </div>
      </Link>

      {!isOwnAd && (
        <div className="space-y-2">
          <Button
            variant="default"
            className="w-full gap-2"
            disabled={startConversation.isPending}
            onClick={handleMessage}
          >
            <MessageSquare className="h-4 w-4" />
            {startConversation.isPending ? 'جارٍ التحضير…' : 'مراسلة البائع'}
          </Button>
        </div>
      )}
    </div>
  );
}
