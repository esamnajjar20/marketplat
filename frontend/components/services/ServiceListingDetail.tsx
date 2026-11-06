'use client';

import { useStickyCtaVisible } from '@/hooks/useStickyCtaVisible';
import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { Clock, Eye } from 'lucide-react';
import { ServiceListingGallery } from '@/components/services/ServiceListingGallery';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
// PERF-BUNDLE-DETAIL-01: الأزرار الثانوية كسولة (LazyDetailActions).
import {
  LazyShareAdButton as ShareAdButton,
  LazyReportServiceButton as ReportServiceButton,
  LazySaveOfflineButton as SaveOfflineButton,
} from '@/components/shared/LazyDetailActions';
import { ProviderContactCard } from '@/components/services/ProviderContactCard';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { DetailSafetyTips } from '@/components/shared/DetailSafetyTips';
import { ServiceTypeAttributesDisplay } from '@/components/services/ServiceTypeAttributesDisplay';
import { ServiceListingMatches } from '@/components/services/ServiceListingMatches';
import { ROUTES, APP_URL } from '@/lib/constants';
import { formatRelativeTime, formatServicePrice } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  DETAIL_PANEL_PADDED,
  DETAIL_SECTION_TITLE,
  TAG_AVAILABLE,
  TAG_OUT,
  TAG_MUTED,
  STICKY_BAR,
} from '@/components/shared/detail/detailTokens';
import type { ServiceListingWithProvider, ServiceLocationType } from '@/types/service.types';

interface Props {
  listing: ServiceListingWithProvider;
  /** Primary CTA only (e.g. طلب خدمة) — messaging lives on ProviderContactCard */
  action?: ReactNode;
}

const LOCATION_LABELS: Record<ServiceLocationType, string> = {
  AT_CUSTOMER: 'لدى العميل',
  AT_PROVIDER: 'لدى مقدم الخدمة',
  REMOTE: 'عن بُعد',
};

export function ServiceListingDetail({ listing, action }: Props) {
  const stickyCta = useStickyCtaVisible();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  const validImages = useMemo(
    () => (Array.isArray(listing.images) ? listing.images : []).filter(
      (image) => typeof image === 'string' && image.trim().length > 0,
    ),
    [listing.images],
  );
  const shareUrl = `${APP_URL}${ROUTES.serviceDetail(listing.id)}`;

  const providerUserId = listing.provider.sellerProfile?.userId;

  return (
    <>
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        {/* ── Main column ── */}
        <div className="min-w-0 flex-1 space-y-6 lg:w-2/3">
          <ServiceListingGallery images={validImages} title={listing.title} />

          {/* Title + price */}
          <header className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">
                {listing.title}
              </h1>
              <div className="flex items-center gap-1">
                <FavoriteButton entityType="SERVICE_LISTING" entityId={listing.id} warm />
                {/* SAVE-ENTITY-SERVICE-01: icon variant fits in this tight
                    action row next to FavoriteButton. Saves the API
                    response + every image so the service page opens
                    offline. */}
                <SaveOfflineButton
                  type="service"
                  id={listing.id}
                  title={listing.title}
                  subtitle={listing.price != null ? String(listing.price) : null}
                  city={null}
                  thumbnail={listing.images?.[0] ?? null}
                  imageUrls={listing.images ?? []}
                  variant="icon"
                />
                {/* SHARE-QR-WIRE-SERVICE: extra carries the service
                    location type (منزلي / عند مقدم الخدمة / عن بُعد). */}
                <ShareAdButton
                  title={listing.title}
                  url={shareUrl}
                  variant="button"
                  qrPayload={{
                    kind: 'service',
                    title: listing.title,
                    price: listing.price ?? null,
                    city: '',
                    extra: LOCATION_LABELS[listing.serviceLocation] ?? '',
                    desc: listing.description ?? '',
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold text-primary">
                {formatServicePrice(listing.pricingType, listing.price)}
              </p>
              {listing.provider.availabilityStatus === 'UNAVAILABLE' ? (
                <span className={TAG_OUT}>غير متاح حاليًا</span>
              ) : (
                <span className={TAG_AVAILABLE}>متاح الآن</span>
              )}
              {listing.provider.sellerProfile?.verified && (
                <span className={TAG_AVAILABLE}>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5 9-10"/></svg>
                  مقدم موثّق
                </span>
              )}
              {LOCATION_LABELS[listing.serviceLocation] && (
                <span className={TAG_MUTED}>{LOCATION_LABELS[listing.serviceLocation]}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {listing.durationEstimate && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {listing.durationEstimate}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                {listing.views} مشاهدة
              </span>
              <span>{now === null ? '—' : formatRelativeTime(listing.createdAt, now)}</span>
            </div>
          </header>

          <ServiceTypeAttributesDisplay listing={listing} />
          <ServiceListingMatches listingId={listing.id} />

          {/* Description */}
          {listing.description && (
            <div className={DETAIL_PANEL_PADDED}>
              <h2 className={cn(DETAIL_SECTION_TITLE, 'mb-2')}>التفاصيل</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {listing.description}
              </p>
            </div>
          )}

          <DetailSafetyTips />

          {/* CTA + Provider — mobile (desktop has sidebar) */}
          <div className="space-y-3 md:hidden">
            {action ? (
              <div className={DETAIL_PANEL_PADDED}>
                {action}
              </div>
            ) : null}
            <div>
              <h2 className={cn(DETAIL_SECTION_TITLE, 'mb-2')}>مقدم الخدمة</h2>
              <ProviderContactCard listing={listing} />
            </div>
          </div>

          <div className="flex justify-end">
            <ReportServiceButton serviceListingId={listing.id} />
          </div>
        </div>

        {/* ── Desktop sidebar ── */}
        <aside className="hidden w-full shrink-0 space-y-4 lg:block lg:w-1/3">
          <div className="space-y-4">
            {action && (
              <div className={DETAIL_PANEL_PADDED}>
                {action}
              </div>
            )}
            <ProviderContactCard listing={listing} />
          </div>
        </aside>
      </div>


      {/* Mobile sticky CTA — matches design: price + primary action */}
      {(providerUserId || action) && (
        <div className={cn(STICKY_BAR, 'md:hidden', stickyCta.transitionClass, stickyCta.hiddenClass)}>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">يبدأ من</div>
            <b className="text-[15px] font-extrabold text-primary tabular-nums">
              {formatServicePrice(listing.pricingType, listing.price)}
            </b>
          </div>
          {action ? (
            <div className="flex-[1.6]">{action}</div>
          ) : providerUserId ? (
            <MessageUserButtonGate
              targetUserId={providerUserId}
              size="lg"
              variant="default"
              label="راسل مقدم الخدمة"
              context={{ type: 'service', id: listing.id }}
              className="flex-[1.6] gap-1.5 rounded-xl font-bold"
            />
          ) : null}
        </div>
      )}

    </>
  );
}
