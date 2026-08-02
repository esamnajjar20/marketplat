import type { Metadata } from 'next';
import { ProductForm } from '@/components/stores/ProductForm';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'منتج جديد', noIndex: true });

export default function NewProductPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">إضافة منتج جديد</h1>
      <ProductForm mode="create" />
    </div>
  );
}
