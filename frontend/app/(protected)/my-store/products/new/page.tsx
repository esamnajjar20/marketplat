import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CreateProductGate } from '@/components/stores/CreateProductGate';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'منتج جديد', noIndex: true });

export default function NewProductPage() {
  return (
    // DESKTOP-AUDIT-05: see ads/create/page.tsx's matching comment.
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">إضافة منتج جديد</h1>
      {/* FIX NEXT15-SEARCHPARAMS-SUSPENSE: ProductForm uses
          useSearchParams() to read ?draftId= — Next.js 15 requires a
          Suspense boundary above any component that does. Without it,
          the static-prerender pass (triggered by the SW warming this
          route) throws and the nearest error boundary renders
          'حدث خطأ أثناء تحميل هذه الصفحة'. */}
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        }
      >
        <CreateProductGate />
      </Suspense>
    </div>
  );
}
