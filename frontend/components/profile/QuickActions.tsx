'use client';

import Link from 'next/link';
import { Plus, List, Heart, Settings, MessageSquare, Store } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { useMySellerProfile } from '@/hooks/queries/useSellers';

// SELLER-GATE: "نشر إعلان جديد" / "إعلاناتي" require a SellerProfile
// server-side (ads.service.ts's createAd → ensureSellerProfileForAdCreation
// throws otherwise) — same gate already applied to
// ProtectedSidebar/ProtectedMobileNav/UserMenu/MobileNav/ProtectedHeader/
// BottomNav. Kept out of the static `actions` array below since these
// two entries are now conditional; the rest stay role-agnostic.
const NON_SELLER_ACTIONS = [
  { href: ROUTES.myServiceRequests,  label: 'طلباتي',          icon: MessageSquare, variant: 'secondary' },
  { href: '/favorites',              label: 'المفضلة',         icon: Heart,         variant: 'secondary' },
  { href: ROUTES.settings.profile,   label: 'الإعدادات',       icon: Settings,      variant: 'secondary' },
] as const;

const SELLER_ACTIONS = [
  { href: ROUTES.adCreate, label: 'نشر إعلان جديد', icon: Plus, variant: 'primary' },
  { href: ROUTES.myAds,    label: 'إعلاناتي',        icon: List, variant: 'secondary' },
] as const;

const SELLER_CTA_ACTION = {
  href: ROUTES.settings.seller, label: 'أنشئ حساب بائع', icon: Store, variant: 'primary',
} as const;

export function QuickActions() {
  // sellerLoaded gates out a flash of the wrong action set before the
  // query resolves — same "isSuccess && data is the only positive
  // signal" pattern used everywhere else this gate appears.
  const { data: sellerProfile, isSuccess: sellerLoaded } = useMySellerProfile();
  const isSeller = sellerLoaded && Boolean(sellerProfile);

  if (!sellerLoaded) return null;

  const actions = isSeller
    ? [...SELLER_ACTIONS, ...NON_SELLER_ACTIONS]
    : [SELLER_CTA_ACTION, ...NON_SELLER_ACTIONS];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {actions.map(({ href, label, icon: Icon, variant }) => (
        <Link key={href} href={href}
          className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center text-sm font-medium transition-colors
            ${variant === 'primary'
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 border-primary'
              : 'bg-card hover:bg-muted border-border'}`}>
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </div>
  );
}
