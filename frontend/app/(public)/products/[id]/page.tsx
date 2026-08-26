import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetailSection } from '@/components/stores/ProductDetailSection';
import { productsApi } from '@/api/products.api';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await productsApi.getById(id);
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

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6">
      <ProductDetailSection id={id} />
    </div>
  );
}
