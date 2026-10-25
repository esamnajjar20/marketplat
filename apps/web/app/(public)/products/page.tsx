import type { Metadata } from 'next';
import { ProductsPageClient } from '@/components/stores/ProductsPageClient';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'المنتجات', path: '/products' });

export default function ProductsPage() {
  return <ProductsPageClient />;
}
