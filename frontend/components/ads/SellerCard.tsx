'use client';

import Link from 'next/link';
import Image from 'next/image';
import { MessageSquare, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { ROUTES } from '@/lib/constants';
import { getAvatarUrl } from '@/lib/cloudinary';
import { useSellerProfile } from '@/hooks/queries/useSellers';
import type { AdAuthor } from '@/types/ad.types';

interface Props { seller: AdAuthor; adId: string; sellerProfileId: string | null; }

// FIX FEAT-01: adId is kept in Props (so call sites and the eventual
// re-enabled messaging link don't need to change) but is currently
// unused inside the component while the button is disabled.
// noUnusedParameters is enabled in tsconfig.json, hence the _ prefix.
//
// sellerProfileId (new): most ads have one — see seller-profile-design.md
// §8, ad creation is gated on the author owning a SellerProfile. It can
// still be null for ads created before that system shipped, in which
// case this card falls back to linking the plain user profile instead
// of the seller page.
export function SellerCard({ seller, adId: _adId, sellerProfileId }: Props) {
  const avatar = getAvatarUrl(seller.avatarUrl ?? '', 64);
  // Only fetches when there's actually a profile to show trust info for —
  // avoids a wasted request/loading flicker on legacy ads with no seller.
  const { data: sellerProfile } = useSellerProfile(sellerProfileId ?? '');

  const profileHref = sellerProfileId
    ? ROUTES.sellerProfile(sellerProfileId)
    : ROUTES.userProfile(seller.id);

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

      <div className="space-y-2">
        {/*
          FIX FEAT-01 / AUDIT-V4-03: previously linked to
          /messages?adId=...&sellerId=..., but no messaging backend
          exists (no Conversation/Message Prisma models, no endpoints).
          The /messages pages themselves now show an explicit "coming
          soon" state (see app/(protected)/messages/page.tsx) instead of
          rendering stub components — this button stays disabled so
          users aren't routed there at all in the meantime. Re-enable
          once a real messaging module ships.
        */}
        <Button variant="default" className="w-full gap-2" disabled
          title="ميزة المراسلة قيد التطوير حالياً">
          <MessageSquare className="h-4 w-4" />
          مراسلة البائع (قريباً)
        </Button>
      </div>
    </div>
  );
}
