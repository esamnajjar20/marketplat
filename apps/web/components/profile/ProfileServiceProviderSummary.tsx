'use client';

import Link from 'next/link';
import { PlusCircle, Wrench } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Button } from '@/components/shared/ui/Button';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { getAvatarUrl } from '@/lib/cloudinary';
import { ROUTES, APP_URL } from '@/lib/constants';
import type { PublicProfileServiceProvider } from '@/types/user.types';
import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';
import type { ServiceAvailability } from '@/types/service.types';
import type { StorePaymentMethodDto } from '@/types/store.types';

interface Props {
  provider: PublicProfileServiceProvider;
  /** Profile owner userId — for share URL and public profile links. */
  profileUserId: string;
  isOwnProvider?: boolean;
  // UNIFY-PAYMENTS: provider no longer carries its own paymentMethods —
  // it's the parent seller's (PublicSellerProfile.paymentMethods),
  // passed down from ProfileTabsSection since this component only
  // receives the serviceProviderDetails slice, not the whole seller.
  sellerPaymentMethods?: StorePaymentMethodDto[] | null;
}

const AVAILABILITY_LABEL: Record<ServiceAvailability, string> = {
  AVAILABLE: 'متاح الآن',
  BUSY: 'مشغول',
  UNAVAILABLE: 'غير متاح',
};

const AVAILABILITY_DOT: Record<ServiceAvailability, string> = {
  AVAILABLE: 'bg-success',
  BUSY: 'bg-warning',
  UNAVAILABLE: 'bg-muted-foreground',
};


/**
 * UNIFIED-PROFILE: summary card for the profile's "الخدمات" tab.
 * S3: share + call + WhatsApp + clear path to browse/request services.
 */
export function ProfileServiceProviderSummary({
  provider,
  profileUserId,
  isOwnProvider,
  sellerPaymentMethods,
}: Props) {
  const logo = getAvatarUrl(provider.logoUrl ?? '', 96);
  const shareUrl = `${APP_URL}${ROUTES.userProfile(profileUserId)}?tab=services`;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 rounded-full overflow-hidden bg-muted shrink-0 border">
            <SafeImage
              variant="avatar"
              src={logo}
              alt={provider.businessName}
              fill
              className="object-cover"
              sizes="56px"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{provider.businessName}</h3>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${AVAILABILITY_DOT[provider.availabilityStatus]}`}
              />
              {AVAILABILITY_LABEL[provider.availabilityStatus]}
            </span>
            {provider.serviceAreaCities.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {provider.serviceAreaCities.join('، ')}
              </p>
            )}
            {provider.completedRequestsCount > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {provider.completedRequestsCount} طلب مكتمل
              </p>
            )}
          </div>
        </div>

        {provider.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
            {provider.description}
          </p>
        )}

        {!isOwnProvider && (
          <div className="flex flex-wrap gap-2">
            <ShareAdButton title={provider.businessName} url={shareUrl} variant="button" className="flex-1 min-w-[7rem]" />
          </div>
        )}

        {isOwnProvider && (
          <ShareAdButton title={provider.businessName} url={shareUrl} variant="button" className="w-full" />
        )}

        <p className="text-xs text-muted-foreground leading-relaxed">
          لطلب خدمة: افتح إحدى الخدمات أدناه (إن وُجدت) أو من صفحة الخدمات، ثم اضغط «إرسال طلب لمقدم الخدمة».
        </p>

        <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
          <Link href={`${ROUTES.services}?providerId=${provider.id}`}>
            <Wrench className="h-3.5 w-3.5" />
            تصفح خدمات هذا المقدّم
          </Link>
        </Button>
      </div>

      {isOwnProvider && (
        <Button asChild variant="outline" className="w-full rounded-full py-3 h-auto gap-2">
          <Link href={ROUTES.adCreate}>
            <PlusCircle className="h-4 w-4" />
            نشر إعلان
          </Link>
        </Button>
      )}

      <StorePaymentMethods
        paymentMethods={sellerPaymentMethods}
        entityName={provider.businessName}
        fallbackName={provider.businessName}
        className="mt-3"
      />
    </div>
  );
}
