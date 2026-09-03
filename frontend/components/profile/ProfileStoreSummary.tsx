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
    <div className="space-y-3">
      <Link
        href={ROUTES.storeDetail(store.id)}
        className="block overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
      >
        {cover && (
          <div className="relative h-28 w-full bg-muted">
            <SafeImage src={cover} alt="" fill className="object-cover" sizes="100vw" />
          </div>
        )}
        <div className="flex items-center gap-3 p-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border bg-muted">
            <SafeImage variant="avatar" src={logo} alt={store.name} fill className="object-cover" sizes="56px" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold text-foreground">{store.name}</h3>
              {store.plan === 'FEATURED' && (
                <Badge className="shrink-0 gap-1 bg-accent text-accent-foreground hover:bg-accent">
                  <Sparkles className="h-3 w-3" /> مميز
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {store._count.products} منتج · {store._count.followers} متابع · {store.city}
            </p>
          </div>
        </div>
      </Link>

      <StorePaymentMethods
        paymentMethods={sellerPaymentMethods}
        entityName={store.name}
        fallbackName={store.name}
        fallbackPhone={(store as { phone?: string }).phone}
        className="w-full max-w-sm"
      />
    </div>
  );
}
