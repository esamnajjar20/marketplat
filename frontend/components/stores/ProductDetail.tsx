'use client';

/**
 * Public product detail — mirrors AdDetail structure so shoppers get
 * gallery, price, description, store context, and related products
 * instead of only a ?product= highlight on the store page.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  MapPin, Eye, Package, ChevronRight, ChevronLeft, Phone, Store as StoreIcon, X,
} from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { SafeImg } from '@/components/shared/ui/SafeImg';
import { Button } from '@/components/shared/ui/Button';
import { FavoriteButton } from '@/components/shared/FavoriteButton';
import { SaveOfflineButton } from '@/components/shared/SaveOfflineButton';
import { ShareAdButton } from '@/components/ads/ShareAdButton';
import { ReportProductButton } from '@/components/stores/ReportProductButton';
import { MessageUserButtonGate } from '@/components/profile/MessageUserButtonGate';
import { DetailSafetyTips } from '@/components/shared/DetailSafetyTips';
import { StorePaymentMethods } from '@/components/payment/StorePaymentMethods';
import { ProductCard } from '@/components/stores/ProductCard';
import { ProductRecommendations } from '@/components/recommendations/ProductRecommendations';
import { getDetailImageUrl, getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';
import { formatPrice, formatPhone, formatRelativeTime } from '@/lib/formatters';
import { ROUTES, APP_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ProductWithFullStore, ProductAvailability } from '@/types/product.types';
import type { ProductWithStore } from '@/types/product.types';

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
  const [imgIdx, setImgIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // SW-FIX-PD-LIGHTBOX-SCROLL: AdDetail.tsx already locks body scroll
  // while its lightbox is open; this one didn't, so the page behind
  // scrolled under the modal on touch.
  useEffect(() => {
    if (!lightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  const images = product.images && product.images.length > 0 ? product.images : [PLACEHOLDER_SVG];
  const currentImg = getDetailImageUrl(images[imgIdx] ?? PLACEHOLDER_SVG);

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

  const goPrev = useCallback(() => {
    setImgIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setImgIdx((i) => Math.min(images.length - 1, i + 1));
  }, [images.length]);

  const store = product.store;
  const shareUrl = `${APP_URL}${ROUTES.productDetail(product.id)}`;
  const ownerId = store.sellerProfile?.userId;

  return (
    <>
      <div className={cn('flex flex-col gap-6 md:flex-row md:gap-8', ownerId ? 'pb-sticky-contact' : 'pb-8' /* FIX PB-STICKY-FALLBACK */)}>
        {/* Gallery + description */}
        <div className="min-w-0 flex-1 space-y-6 lg:w-2/3">
          <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
            <div
              className="relative aspect-[4/3] bg-muted touch-pan-y sm:aspect-[16/9]"
              onTouchStart={(e) => {
                touchStartX.current = e.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(e) => {
                if (touchStartX.current == null || images.length <= 1) return;
                const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(dx) < 40) return;
                if (dx > 0) goPrev();
                else goNext();
              }}
            >
              <button
                type="button"
                className="absolute inset-0 cursor-zoom-in"
                onClick={() => setLightboxOpen(true)}
                aria-label="تكبير الصورة"
              >
                <SafeImage
                  src={currentImg}
                  alt={product.name}
                  fill
                  className="pointer-events-none select-none object-contain"
                  sizes="(max-width:1024px) 100vw, 66vw"
                  priority={imgIdx === 0}
                  draggable={false}
                />
              </button>

              {hasDiscount && effectivePrice.discountPercentage != null && (
                <span className="absolute top-4 start-4 rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground shadow-sm">
                  خصم {effectivePrice.discountPercentage}%
                </span>
              )}

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={imgIdx === 0}
                    aria-label="الصورة السابقة"
                    className="absolute start-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow disabled:opacity-40"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={imgIdx === images.length - 1}
                    aria-label="الصورة التالية"
                    className="absolute end-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 shadow disabled:opacity-40"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2.5 py-0.5 text-xs font-medium tabular-nums">
                    {imgIdx + 1} / {images.length}
                  </span>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3">
                {images.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setImgIdx(i)}
                    aria-label={`صورة ${i + 1}`}
                    className={cn(
                      'relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2',
                      i === imgIdx ? 'border-primary' : 'border-transparent opacity-70',
                    )}
                  >
                    <SafeImage
                      src={getThumbnailUrl(src, 128, 128)}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title + meta (mobile) */}
          <div className="space-y-3 lg:hidden">
            <PriceBlock product={product} displayPrice={displayPrice} hasDiscount={hasDiscount} />
            <h1 className="text-xl font-bold leading-snug">{product.name}</h1>
            <MetaRow product={product} />
            <ActionRow product={product} shareUrl={shareUrl} />
          </div>

          <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-semibold">الوصف</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {product.description?.trim() || 'لا يوجد وصف إضافي لهذا المنتج.'}
            </p>
          </section>

          <ProductAttributesSection product={product} />

          {/* المتجر مباشرة تحت الوصف — الوصول عبر الشعار/الاسم */}
          <StorePanel store={store} />

          {related.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">منتجات من نفس المتجر</h2>
              <div className="grid grid-cols-2 gap-3">
                {related.map((p) => (
                  <ProductCard key={p.id} product={p} storeId={product.storeId} context="related" />
                ))}
              </div>
            </section>
          )}

          <DetailSafetyTips />

          {/* توصيات من متاجر أخرى فقط — حتى لا تتكرر مع قسم نفس المتجر */}
          <ProductRecommendations
            excludeProductId={product.id}
            excludeStoreId={product.storeId}
          />
        </div>

        {/* Sidebar — سعر وإجراءات فقط (بدون sticky) */}
        <aside className="hidden w-full shrink-0 space-y-4 lg:block lg:w-1/3">
          <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
            <PriceBlock product={product} displayPrice={displayPrice} hasDiscount={hasDiscount} />
            <h1 className="text-xl font-bold leading-snug">{product.name}</h1>
            <MetaRow product={product} />
            <ActionRow product={product} shareUrl={shareUrl} />
          </div>
        </aside>
      </div>

      {/* Mobile sticky contact CTA — price + message above BottomNav */}
      {ownerId && (
        <div className="sticky-contact-bar md:hidden border-t border-border bg-card/95 px-4 py-3 shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur supports-[backdrop-filter]:bg-card/90">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-primary truncate">
                {formatPrice(String(displayPrice))}
              </p>
              {hasDiscount && (
                <p className="text-xs text-muted-foreground line-through">
                  {formatPrice(String(effectivePrice.originalPrice ?? product.price ?? 0))}
                </p>
              )}
            </div>
            <MessageUserButtonGate
              targetUserId={ownerId}
              size="lg"
              variant="default"
              label="مراسلة"
              className="shrink-0 gap-2 rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة الصورة"
        >
          <button
            type="button"
            className="absolute top-4 end-4 rounded-full bg-white/10 p-2 text-white"
            onClick={() => setLightboxOpen(false)}
            aria-label="إغلاق"
          >
            <X className="h-6 w-6" />
          </button>
          <SafeImg
            src={currentImg}
            alt={product.name}
            className="max-h-[90vh] max-w-full object-contain"
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
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold">مواصفات المنتج</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className="rounded-lg bg-muted/40 px-3 py-2">
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
            ? 'inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
            : product.availability === 'LIMITED'
              ? 'inline-flex rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning-strong dark:text-warning'
              : 'inline-flex rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success'
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
      <span>{product.createdAt ? formatRelativeTime(product.createdAt) : ''}</span>
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

function StorePanel({ store }: { store: ProductWithFullStore['store'] }) {
  const ownerId = store.sellerProfile?.userId;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">المتجر</p>
      <Link
        href={ROUTES.storeDetail(store.slug || store.id)}
        className="flex items-center gap-3 rounded-lg transition-colors hover:bg-muted/50"
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
      </Link>
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
