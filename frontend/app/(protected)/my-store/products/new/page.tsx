import type { Metadata } from 'next';
import { CreateProductGate } from '@/components/stores/CreateProductGate';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'منتج جديد', noIndex: true });

export default function NewProductPage() {
  return (
    // DESKTOP-AUDIT-05: see ads/create/page.tsx's matching comment.
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">إضافة منتج جديد</h1>
      <CreateProductGate />
    </div>
  );
}
