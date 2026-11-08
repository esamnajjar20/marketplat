'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';
import {
  DETAIL_PANEL_PADDED,
  DETAIL_SECTION_TITLE,
  DETAIL_PRICE_PANEL,
  TAG_AVAILABLE,
  TAG_LIMITED,
  TAG_OUT,
  STICKY_BAR,
} from '@/components/shared/detail/detailTokens';

/**
 * Public product detail — mirrors AdDetail structure so shoppers get
 * gallery, price, description, store context, and related products
 * instead of only a ?product= highlight on the store page.
 */

import { useStickyCtaVisible } from '@/hooks/useStickyCtaVisible';
import { useMemo } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import {
  MapPin, Eye, Package, Phone, Store as StoreIcon,
} from 'lucide-react';
import { ProductDetailGallery } from '@/components/stores/ProductDetailGallery';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Button } from '@/components/shared/ui/Button';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { DetailSafetyTips } from '@/components/shared/DetailSafetyTips';
import { LazySection } from '@/components/shared/LazySection';
import { ProductCard } from '@/components/stores/ProductCard';
import dynamic from 'next/dynamic';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { formatPrice, formatPhone } from '@/lib/formatters';
import { ROUTES, APP_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ProductWithFullStore, ProductAvailability } from '@/types/product.types';
import type { ProductWithStore } from '@/types/product.types';

// PERF-BUNDLE-PRODUCT-01: أجزاء ثانوية/تحت الطيّة تُحمَّل بعد الـ hydration بدل دخولها
// حزمة /products/[id] الأولى: حفظ للأوفلاين (offlineSavedEntities)، مشاركة + QR،
// إبلاغ (+Select)، طرق الدفع، وتوصيات المتاجر الأخرى (استعلام عميل أصلًا).
// الـ placeholders بأبعاد تقريبية لتقليل CLS.
const SaveOfflineButton = dynamic(
  () => import('@/components/shared/SaveOfflineButton').then((m) => m.SaveOfflineButton),
  { ssr: false, loading: () => <span aria-hidden="true" className="inline-block h-10 w-full" /> },
);
const ShareAdButton = dynamic(
  () => import('@/components/ads/ShareAdButton').then((m) => m.ShareAdButton),
  { ssr: false, loading: () => <span aria-hidden="true" className="inline-block h-10 w-full" /> },
);
const ReportProductButton = dynamic(
  () => import('@/components/stores/ReportProductButton').then((m) => m.ReportProductButton),
  { ssr: false, loading: () => <span aria-hidden="true" className="inline-block h-8 w-full" /> },
);
const StorePaymentMethods = dynamic(
  () => import('@/components/payment/StorePaymentMethods').then((m) => m.StorePaymentMethods),
  { ssr: false, loading: () => <span aria-hidden="true" className="mt-1 block h-12 w-full" /> },
);
const ProductRecommendations = dynamic(
  () => import('@/components/recommendations/ProductRecommendations').then((m) => m.ProductRecommendations),
  { ssr: false, loading: () => null },
);

const AVAILABILITY_LABEL: Record<ProductAvailability, string> = {
  IN_STOCK: 'متوفر',
  LIMITED: 'كمية محدودة',
  OUT_OF_STOCK: 'غير متوفر',
};

interface Props {
  product: ProductWithFullStore;
  related?: ProductWithStore[];
}

export function ProductDetail({ product, related = [] }: Props) {
  const stickyCta = useStickyCtaVisible();
  const images = useMemo(
    () => product.images && product.images.length > 0 ? product.images : [PLACEHOLDER_SVG],
    [product.images],
  );

  // FIX: الـ API يُرجع price/discountPrice مسطّحة، فنحسب effectivePrice محلياً
  const rawPrice = Number(product.price ?? 0);
  const rawDiscount = product.discountPrice != null ? Number(product.discountPrice) : null;
  const effectivePrice = product.effectivePrice ?? {
    price: rawPrice,
    discountPrice: rawDiscount,
    originalPrice: rawPrice,
    discountPercentage:
      rawDiscount != null && rawPrice > 0
        ? Math.round(((rawPrice - rawDiscount) / rawPrice) * 100)
        : null,
  };
  const hasDiscount = effectivePrice.discountPrice !== null;
  const displayPrice = hasDiscount
    ? effectivePrice.discountPrice!
    : effectivePrice.price;

  const store = product.store;
  const shareUrl = `${APP_URL}${ROUTES.productDetail(product.id)}`;
  const ownerId = store.sellerProfile?.userId;

  return (
    <>
      <div className={cn('flex flex-col gap-6 md:flex-row md:gap-8', ownerId ? 'pb-sticky-contact' : 'pb-8' /* FIX PB-STICKY-FALLBACK */)}>
        {/* Gallery + description */}
        <div className="min-w-0 flex-1 space-y-6 lg:w-2/3">
          <ProductDetailGallery
            images={images}
            title={product.name}
            discountPercentage={hasDiscount ? effectivePrice.discountPercentage : null}
          />

          {/* Title + meta (mobile) */}
          <div className="space-y-3 lg:hidden">
            <PriceBlock product={product} displayPrice={displayPrice} hasDiscount={hasDiscount} />
            <h1 className="text-xl font-bold leading-snug">{product.name}</h1>
            <MetaRow product={product} />
            <ActionRow product={product} shareUrl={shareUrl} />
          </div>

          <section className={cn(DETAIL_PANEL_PADDED, 'space-y-3')}>
            <h2 className={DETAIL_SECTION_TITLE}>الوصف</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {product.description?.trim() || 'لا يوجد وصف إضافي لهذا المنتج.'}
            </p>
          </section>

          <ProductAttributesSection product={product} />

          {/* المتجر مباشرة تحت الوصف — الوصول عبر الشعار/الاسم */}
          <StorePanel store={store} productId={product.id} />

          {related.length > 0 && (
            <section className="space-y-3">
              <h2 className={DETAIL_SECTION_TITLE}>منتجات من نفس المتجر</h2>
              <div className="grid grid-cols-2 gap-3">
                {related.map((p) => (
                  <ProductCard key={p.id} product={p} storeId={product.storeId} context="related" />
                ))}
              </div>
            </section>
          )}

          <DetailSafetyTips />

          {/* توصيات من متاجر أخرى فقط — حتى لا تتكرر مع قسم نفس المتجر */}
          <LazySection minHeight={240} rootMargin="96px 0px" whenIdle>
            <ProductRecommendations
              excludeProductId={product.id}
              excludeStoreId={product.storeId}
            />
          </LazySection>
        </div>

        {/* Sidebar — سعر وإجراءات فقط (بدون sticky) */}
        <aside className="hidden w-full shrink-0 space-y-4 lg:block lg:w-1/3">
          <div className={cn(DETAIL_PRICE_PANEL, 'space-y-3')}>
            <PriceBlock product={product} displayPrice={displayPrice} hasDiscount={hasDiscount} />
            <h1 className="text-xl font-bold leading-snug">{product.name}</h1>
            <MetaRow product={product} />
            <ActionRow product={product} shareUrl={shareUrl} />
          </div>
        </aside>
      </div>

      {/* Mobile sticky contact CTA — matches design mockup */}
      {ownerId && (
        <div className={cn(STICKY_BAR, 'md:hidden', stickyCta.transitionClass, stickyCta.hiddenClass)}>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">السعر</div>
            <b className="text-[15px] font-extrabold text-primary tabular-nums">
              {formatPrice(String(displayPrice))}
            </b>
          </div>
          <MessageUserButtonGate
            targetUserId={ownerId}
            context={{ type: 'product', id: product.id }}
            size="lg"
            variant="default"
            label="راسل المتجر"
            className="flex-[1.6] gap-1.5 rounded-xl font-bold"
          />
        </div>
      )}


    </>
  );
}

function ProductAttributesSection({ product }: { product: ProductWithFullStore }) {
  const fields = (product.store.storeType?.fields ?? []).filter(
    (field) => field.scope === 'PRODUCT' && field.isActive !== false && product.attributes?.[field.key] !== undefined,
  );
  if (fields.length === 0) return null;

  const formatValue = (field: (typeof fields)[number], value: unknown) => {
    if (field.type === 'BOOLEAN') return value === true ? 'نعم' : 'لا';
    if (field.type === 'SELECT') return field.options?.find((option) => option.value === value)?.labelAr ?? String(value);
    return String(value);
  };

  return (
    <section className={cn(DETAIL_PANEL_PADDED, 'space-y-3')}>
      <h2 className={DETAIL_SECTION_TITLE}>مواصفات المنتج</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className="rounded-xl border border-border/50 bg-muted/40 px-3 py-3">
            <dt className="text-xs text-muted-foreground">{field.pageLabelAr || field.labelAr}</dt>
            <dd className="mt-1 text-sm font-medium">{formatValue(field, product.attributes?.[field.key])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PriceBlock({
  product,
  displayPrice,
  hasDiscount,
}: {
  product: ProductWithFullStore;
  displayPrice: number;
  hasDiscount: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="font-mono text-2xl font-bold tabular-nums text-primary">
        {formatPrice(String(displayPrice))}
      </p>
      {hasDiscount && (
        <p className="text-sm text-muted-foreground line-through">
          {formatPrice(String(product.effectivePrice?.originalPrice ?? product.effectivePrice?.price ?? 0))}
        </p>
      )}
      <span
        className={
          product.availability === 'OUT_OF_STOCK'
            ? TAG_OUT
            : product.availability === 'LIMITED'
              ? TAG_LIMITED
              : TAG_AVAILABLE
        }
      >
        {AVAILABILITY_LABEL[product.availability]}
      </span>
    </div>
  );
}

function MetaRow({ product }: { product: ProductWithFullStore }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {product.category?.nameAr && (
        <span className="inline-flex items-center gap-1">
          <Package className="h-3.5 w-3.5" aria-hidden />
          {product.category.nameAr}
        </span>
      )}
      {product.store?.city && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {product.store.city}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Eye className="h-3.5 w-3.5" aria-hidden />
        {product.views} مشاهدة
      </span>
      <span>{product.createdAt ? <HydrationSafeRelativeTime date={product.createdAt} /> : ''}</span>
    </div>
  );
}

function ActionRow({ product, shareUrl }: { product: ProductWithFullStore; shareUrl: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FavoriteButton entityType="PRODUCT" entityId={product.id} size="md" warm />
      {/* SAVE-ENTITY-01-PRODUCT: save the product's API response + every
          image into Cache Storage for offline viewing. Writes into the
          shared saved-entities index (same one /saved-ads reads), so
          everything the user saved lives in one place. */}
      <SaveOfflineButton
        type="product"
        id={product.id}
        title={product.name}
        subtitle={product.price != null ? String(product.price) : null}
        city={product.store?.city ?? null}
        thumbnail={product.images?.[0] ?? null}
        imageUrls={product.images ?? []}
      />
      {/* SHARE-QR-WIRE-PRODUCT: same payload shape as AdDetail, with
          product-specific extra text (availability). */}
      <ShareAdButton
        title={product.name}
        url={shareUrl}
        variant="button"
        qrPayload={{
          kind: 'product',
          title: product.name,
          price: product.price ?? null,
          city: product.store?.city ?? '',
          extra: AVAILABILITY_LABEL[product.availability],
          desc: product.description ?? '',
        }}
      />
      <ReportProductButton productId={product.id} />
    </div>
  );
}

function StorePanel({ store, productId }: { store: ProductWithFullStore['store']; productId: string }) {
  const ownerId = store.sellerProfile?.userId;
  return (
    <div className={cn(DETAIL_PRICE_PANEL, 'space-y-3')}>
      <p className="text-xs font-medium text-muted-foreground">المتجر</p>
      <IntentPrefetchLink
        href={ROUTES.storeDetail(store.slug || store.id)}
        className="flex items-center gap-3 rounded-lg transition-colors hover:bg-muted/50" prefetch={false}
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
          {store.logoUrl ? (
            <SafeImage src={getThumbnailUrl(store.logoUrl, 96, 96)} alt="" fill className="object-cover" sizes="48px" />
          ) : (
            <StoreIcon className="m-auto h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{store.name}</p>
          {store.city && (
            <p className="truncate text-xs text-muted-foreground">{store.city}</p>
          )}
        </div>
      </IntentPrefetchLink>
      <div className="flex flex-col gap-2">
        {store.phone && (
          <Button asChild variant="outline" className="w-full gap-2 font-semibold">
            <a href={`tel:${store.phone}`}>
              <Phone className="h-4 w-4" />
              اتصال · {formatPhone(store.phone)}
            </a>
          </Button>
        )}
        {ownerId && (
          <MessageUserButtonGate
            targetUserId={ownerId}
            size="default"
            variant="default"
            label="راسل المتجر"
            context={{ type: 'product', id: productId }}
            className="w-full gap-2 font-semibold"
          />
        )}
        {/* UNIFY-PAYMENTS-STORES: read from sellerProfile — store no
            longer has its own paymentMethods column.
            BUGFIX: sellerProfile can be null (a store whose owner
            never completed seller onboarding) — ownerId above already
            guards this with `?.`, but this line didn't, so opening
            such a product's page threw "Cannot read properties of
            undefined/null (reading 'paymentMethods')" and crashed the
            whole page into ProductDetailError. StorePaymentMethods'
            own paymentMethods prop is already optional/unknown-typed,
            so passing undefined here is a normal, already-handled case. */}
        <StorePaymentMethods
          paymentMethods={store.sellerProfile?.paymentMethods}
          entityName={store.name}
          fallbackName={store.name}
          fallbackPhone={store.phone}
          className="mt-1"
        />
      </div>
    </div>
  );
}
