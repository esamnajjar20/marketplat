'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/ui/SafeImage';
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
        className="group block overflow-hidden rounded-[20px] border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {cover && (
          <div className="relative h-32 w-full bg-muted sm:h-40">
            <SafeImage src={cover} alt="" fill className="object-cover" sizes="100vw" />
          </div>
        )}
        <div className="flex items-center gap-4 p-4 sm:p-5">
          <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px] bg-primary-soft">
            <SafeImage variant="avatar" src={logo} alt={store.name} fill className="object-cover" sizes="52px" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[15px] font-extrabold text-foreground transition-colors group-hover:text-primary sm:text-lg">{store.name}</h3>
              {store.plan === 'FEATURED' && (
                <span className="inline-flex h-[26px] shrink-0 items-center rounded-full bg-accent-soft px-2.5 text-xs font-bold text-accent">متجر مميز</span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{store.city || 'متجر على المنصة'}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-primary-soft px-2.5 py-1 font-bold text-primary-strong">{store._count.products} منتج</span>
              <span className="rounded-full bg-surface-2 px-2.5 py-1 font-bold text-foreground/80">{store._count.followers} متابع</span>
            </div>
          </div>
        </div>
      </Link>

      <StorePaymentMethods
        paymentMethods={sellerPaymentMethods}
        entityName={store.name}
        fallbackName={store.name}
        fallbackPhone={(store as { phone?: string }).phone}
        className="w-full rounded-[20px] border border-border bg-card p-3 sm:p-4"
      />
    </div>
  );
}
