import type { Metadata } from 'next';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { StoresGrid } from '@/components/stores/StoresGrid';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export const metadata: Metadata = buildMetadata({ title: 'المتاجر', path: '/stores' });

export default function StoresPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
      <h1 className="text-xl font-semibold">المتاجر</h1>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <StoresGrid />
      </Suspense>
    </div>
  );
}
