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
 *
 * UX-FIX: previously all three badges shared the same flat
 * `variant="secondary"` — same gray, same small rounded-md pill, no
 * visual distinction between roles even though they mean different
 * things. Restyled with the app's own semantic tokens rather than
 * one-off colors, each a bit larger/pill-shaped for a friendlier read:
 * بائع → primary (the base/brand role — same solid-primary treatment
 * `default` Badge already uses elsewhere for a "this is the main
 * thing" signal); مقدم خدمة → accent (the app's second brand color,
 * already used at full strength + accent-foreground for AdCard's
 * "مميز" pill — same pairing here, not the sub-AA soft-tint use the
 * palette doc restricts small text from); صاحب متجر → success (mirrors
 * AD_STATUS_VARIANT/store-status' own existing "active, come in"
 * meaning for success elsewhere in the app, and reads well as the one
 * badge that's also a clickable invitation to visit).
 */
export function ProfileBadges({ sellerProfile, className }: Props) {
  if (!sellerProfile) return null;

  const store = sellerProfile.storeDetails;
  const isServiceProvider = Boolean(sellerProfile.serviceProviderDetails);

  const pillBase = 'gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold shadow-sm';

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-2', className)}>
      {/* A non-null sellerProfile on a public response is itself the
          "seller" signal — see UNIFIED-PROFILE comment in
          users.service.ts: a suspended seller's profile is nulled out
          entirely before it ever reaches here, so reaching this branch
          already means an actual, non-suspended seller. */}
      <Badge variant="default" className={pillBase}>
        <ShoppingBag className="h-3.5 w-3.5" />
        بائع
      </Badge>
      {isServiceProvider && (
        <Badge className={cn(pillBase, 'border-transparent bg-accent text-accent-foreground hover:bg-accent/80')}>
          <Wrench className="h-3.5 w-3.5" />
          مقدم خدمة
        </Badge>
      )}
      {store && (
        <Link href={ROUTES.storeDetail(store.id)} aria-label={`زيارة متجر ${store.name}`}>
          <Badge
            variant="success"
            className={cn(pillBase, 'cursor-pointer transition-colors hover:bg-success/80')}
          >
            <Store className="h-3.5 w-3.5" />
            صاحب متجر
          </Badge>
        </Link>
      )}
    </div>
  );
}
