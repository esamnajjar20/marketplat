import type { Metadata } from 'next';
import { cache, Suspense } from 'react';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { storesApi } from '@/api/stores.api';
import { StoreHeader } from '@/components/stores/StoreHeader';
import { StoreDetailClient } from '@/components/stores/StoreDetailClient';
import { StoreStorefront } from '@/components/stores/StoreStorefront';
import { StoreRecommendations } from '@/components/recommendations/StoreRecommendations';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';
import { headers } from 'next/headers';
import { buildStoreJsonLd, safeJsonLd } from '@/lib/structuredData';

interface Props {
  params: Promise<{ id: string }>;
}

const getCachedStore = cache((id: string) => storesApi.getById(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const store = await getCachedStore(id);
    // CLEANUP-STORES-NULL-01: was store.data.data!.name — replace
    // with explicit guard so a malformed payload cannot crash SSR.
    const data = store.data.data;
    const name = data?.name;
    if (!name) return { title: 'متجر' };
    // richer SEO — description + OG image from
    // cover (fallback logo) so WhatsApp/Facebook previews show the
    // store identity instead of the generic platform card.
    const description =
      data.description?.trim().slice(0, 160) ||
      `تصفّح منتجات متجر ${name}${data.city ? ` في ${data.city}` : ''}`;
    const image = data.coverImageUrl || data.logoUrl || undefined;
    return buildMetadata({
      title: `${name} — متجر`,
      description,
      path: `/stores/${data.slug || id}`,
      image,
    });
  } catch {
    return { title: 'متجر' };
  }
}

export default async function StorePage({ params }: Props) {
  const { id } = await params;
  let store: Awaited<ReturnType<typeof storesApi.getById>>['data']['data'] | null = null;

  try {
    const res = await getCachedStore(id);
    store = res.data.data ?? null;
  } catch (err) {
    // STORE-DETAIL-ERROR-CLASSIFY-01: the old bare `catch { /* 404 */ }`
    // swallowed every failure as "not found". A slow Render cold-start,
    // a DNS blip, or a 5xx all rendered the "المتجر غير موجود" empty
    // state, telling a user that an existing store was deleted. Only a
    // confirmed 404 (backend said so) is a genuine miss; anything else
    // propagates so app/(public)/error.tsx can show a retry UI.
    const statusCode =
      (err as { statusCode?: number; response?: { status?: number } })?.statusCode ??
      (err as { response?: { status?: number } })?.response?.status;
    // FIX SSR-FALLBACK-03: instead of throwing (opaque React #441 crash), let
    // the browser fetch the store through the same-origin proxy.
    if (statusCode !== 404) return <StoreDetailClient id={id} />;
  }

  if (!store) {
    return (
      <div className="container mx-auto max-w-7xl px-3 py-6 sm:px-4 lg:py-8">
        <EmptyState
          icon={<SearchX className="h-10 w-10" />}
          title="المتجر غير موجود"
          description="ربما تم حذف هذا المتجر أو أن الرابط غير صحيح"
          action={
            <Link href={ROUTES.stores} className="text-sm text-primary hover:underline">
              تصفح المتاجر
            </Link>
          }
        />
      </div>
    );
  }

  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    // widen from max-w-3xl → max-w-5xl so the
    // product grid and tabs breathe on tablet/desktop without losing
    // the centered mobile-first feel.
    <div className="container mx-auto w-full max-w-7xl space-y-8 px-3 py-6 sm:px-4 lg:py-8">
      {/* SW-SEO-JSONLD-STORE-01: LocalBusiness/Store schema. Phone and
          address are present on StoreDetails, so Google can surface a
          store card with contact info and location. */}
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            buildStoreJsonLd({
              id: store.id,
              name: store.name,
              slug: store.slug,
              description: store.description,
              logoUrl: store.logoUrl,
              coverImageUrl: store.coverImageUrl,
              phone: store.phone,
              city: store.city,
              address: store.address,
              latitude: store.latitude,
              longitude: store.longitude,
            }),
          ),
        }}
      />
      <StoreHeader store={store} />

      <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
        <StoreStorefront
          storeId={store.id}
          storeName={store.name}
          ownerUserId={store.sellerProfile?.userId ?? ''}
          store={store}
        />
      </Suspense>

      <StoreRecommendations excludeStoreId={store.id} />
    </div>
  );
}
