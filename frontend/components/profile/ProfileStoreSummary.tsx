'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { getAvatarUrl, getDetailImageUrl } from '@/lib/cloudinary';
import { ROUTES } from '@/lib/constants';
import type { PublicProfileStore } from '@/types/user.types';
import type { StorePaymentMethodDto } from '@/types/store.types';
import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';

interface Props {
  store: PublicProfileStore;
  // UNIFY-PAYMENTS-STORES: PublicProfileStore no longer carries its own
  // paymentMethods — passed down separately from the parent seller
  // profile, same pattern as ProfileServiceProviderSummary's
  // sellerPaymentMethods prop.
  sellerPaymentMethods?: StorePaymentMethodDto[] | null;
}

/**
 * UNIFIED-PROFILE: summary card for the profile's "المتجر" tab — not a
 * replacement for StoreHeader.tsx. Includes زر دفع واحد مثل تبويب الخدمة.
 */
export function ProfileStoreSummary({ store, sellerPaymentMethods }: Props) {
  const logo = getAvatarUrl(store.logoUrl ?? '', 96);
  const cover = store.coverImageUrl ? getDetailImageUrl(store.coverImageUrl, 800) : null;

  return (
    <div className="space-y-4">
      <Link
        href={ROUTES.storeDetail(store.id)}
        className="group block overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {cover && (
          <div className="relative h-32 w-full bg-muted sm:h-40">
            <SafeImage src={cover} alt="" fill className="object-cover" sizes="100vw" />
          </div>
        )}
        <div className="flex items-center gap-4 p-4 sm:p-5">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/70 bg-muted shadow-sm">
            <SafeImage variant="avatar" src={logo} alt={store.name} fill className="object-cover" sizes="64px" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-bold text-foreground transition-colors group-hover:text-primary sm:text-lg">{store.name}</h3>
              {store.plan === 'FEATURED' && (
                <Badge className="shrink-0 gap-1 bg-accent text-accent-foreground hover:bg-accent">
                  <Sparkles className="h-3 w-3" /> مميز
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{store.city || 'متجر على المنصة'}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">{store._count.products} منتج</span>
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">{store._count.followers} متابع</span>
            </div>
          </div>
        </div>
      </Link>

      <StorePaymentMethods
        paymentMethods={sellerPaymentMethods}
        entityName={store.name}
        fallbackName={store.name}
        fallbackPhone={(store as { phone?: string }).phone}
        className="w-full rounded-2xl border border-border/70 bg-card p-3 sm:p-4"
      />
    </div>
  );
}
