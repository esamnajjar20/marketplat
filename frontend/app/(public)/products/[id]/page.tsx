import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetailSection } from '@/components/stores/ProductDetailSection';
import { productsApi } from '@/api/products.api';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';
import { cache } from 'react';
import { headers } from 'next/headers';
import { buildProductJsonLd, safeJsonLd } from '@/lib/structuredData';

interface Props {
  params: Promise<{ id: string }>;
}

// SW-SEO-JSONLD-PRODUCT-01: cache() so generateMetadata and the page
// body share one backend call. React's cache() memoises by argument
// within a single render pass — no cross-request leak.
const getCachedProduct = cache((id: string) => productsApi.getById(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await getCachedProduct(id);
    const product = res.data.data;
    if (!product) return { title: 'المنتج غير موجود' };
    return buildMetadata({
      title: product.name,
      description: product.description?.slice(0, 160),
      path: ROUTES.productDetail(id),
      image: product.images?.[0],
    });
  } catch {
    return { title: 'منتج' };
  }
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  if (!id) notFound();

  // Fetch the product here so JSON-LD can be emitted server-side. On
  // a 404, buildProductJsonLd is skipped — the detail section itself
  // renders its own error UI, and JSON-LD for a non-existent entity
  // would be worse than none.
  let product: Awaited<ReturnType<typeof getCachedProduct>>['data']['data'] | null = null;
  try {
    const res = await getCachedProduct(id);
    product = res.data.data ?? null;
  } catch {
    /* 404 — ProductDetailSection renders the empty state */
  }
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      {product && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(
              buildProductJsonLd({
                id: product.id,
                name: product.name,
                description: product.description,
                images: product.images,
                price: product.price,
                discountPrice: product.discountPrice,
                availability: product.availability,
                updatedAt: product.updatedAt,
              }),
            ),
          }}
        />
      )}
      <ProductDetailSection id={id} />
    </div>
  );
}
