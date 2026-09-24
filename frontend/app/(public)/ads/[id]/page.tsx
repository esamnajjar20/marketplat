import type { Metadata }    from 'next';
import { notFound }         from 'next/navigation';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { AdDetailSection }  from '@/components/ads/AdDetailSection';
import { getQueryClient }   from '@/lib/queryClient';
import { prefetchAdDetail as prefetchAd } from '@/lib/prefetch';
import { buildAdMetadata }  from '@/lib/seo';
import { headers }          from 'next/headers';
import type { Ad }          from '@/types/ad.types';
import { buildAdJsonLd, safeJsonLd } from '@/lib/structuredData';

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const qc = getQueryClient();
  try {
    await prefetchAd(qc, id);
    const ad = qc.getQueryData<{ title: string; description: string; images: string[]; price: string | null; city: string }>(['ads', 'detail', id]);
    if (!ad) return { title: 'الإعلان غير موجود' };
    return buildAdMetadata({ id, ...ad });
  } catch { return { title: 'الإعلان' }; }
}

export default async function AdDetailPage({ params }: Props) {
  const { id } = await params;
  const qc = getQueryClient();
  try { await prefetchAd(qc, id); } catch { notFound(); }

  // SW-SEO-JSONLD-AD-01: read the same Ad object that generateMetadata
  // already fetched — prefetchAd populates the cache and getQueryData
  // resolves it synchronously, so this adds no extra network call.
  // The Ad is typed as the full interface; missing optional fields
  // (sellerProfile, category, images) are handled by the builder.
  const ad = qc.getQueryData<Ad>(['ads', 'detail', id]);
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Product + Offer schema so Google can surface the price,
          availability, and (when available) the aggregate rating in
          search results. Only emitted when an Ad is actually in
          cache — a 404 or fetch failure above calls notFound() and
          never reaches this render. Same CSP nonce as every other
          inline script in the app. */}
      {ad && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: safeJsonLd(buildAdJsonLd(ad)) }}
        />
      )}
      <HydrationBoundary state={dehydrate(qc)}>
        <AdDetailSection id={id} />
      </HydrationBoundary>
    </div>
  );
}
