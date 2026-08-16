import Link from 'next/link';
import { ShoppingBag, Wrench, Store } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/constants';
import type { PublicSellerProfile } from '@/types/user.types';

interface Props {
  sellerProfile: PublicSellerProfile | null;
  className?: string;
}

/**
 * ProfileBadges — pure display of "what kind of activity does this
 * person have on the platform" based on data already present on
 * PublicUser.sellerProfile (see users.repository.ts's publicUserSelect /
 * UNIFIED-PROFILE). No new endpoint, no new fields: role alone isn't
 * used here on purpose — a plain USER and a seller share the same Role
 * enum value, so seller/store/service-provider status is only ever
 * determined by which nested profile objects the backend actually
 * returned (sellerProfile / storeDetails / serviceProviderDetails),
 * matching how PublicProfileHeader and ProfileServiceProviderSummary /
 * ProfileStoreSummary already gate on the same fields.
 *
 * Presence alone is the signal — storeDetails is already gated to
 * status: 'ACTIVE' server-side (see users.repository.ts), so no extra
 * "is this verified/active" check belongs here.
 *
 * The store badge doubles as a Link to /stores/[id] (same ROUTES.storeDetail
 * target ProfileStoreSummary's card already uses) — the header is the
 * fastest place a visitor scans for "does this person have a store",
 * so making that badge itself the way there avoids sending them hunting
 * for the separate "المتجر" tab further down the page.
 */
export function ProfileBadges({ sellerProfile, className }: Props) {
  if (!sellerProfile) return null;

  const store = sellerProfile.storeDetails;
  const isServiceProvider = Boolean(sellerProfile.serviceProviderDetails);

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}>
      {/* A non-null sellerProfile on a public response is itself the
          "seller" signal — see UNIFIED-PROFILE comment in
          users.service.ts: a suspended seller's profile is nulled out
          entirely before it ever reaches here, so reaching this branch
          already means an actual, non-suspended seller. */}
      <Badge variant="secondary" className="gap-1">
        <ShoppingBag className="h-3 w-3" />
        بائع
      </Badge>
      {isServiceProvider && (
        <Badge variant="secondary" className="gap-1">
          <Wrench className="h-3 w-3" />
          مقدم خدمة
        </Badge>
      )}
      {store && (
        <Link href={ROUTES.storeDetail(store.id)} aria-label={`زيارة متجر ${store.name}`}>
          <Badge
            variant="secondary"
            className="gap-1 cursor-pointer transition-colors hover:bg-secondary/80"
          >
            <Store className="h-3 w-3" />
            صاحب متجر
          </Badge>
        </Link>
      )}
    </div>
  );
}
