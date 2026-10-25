import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata } from '@/lib/seo';

const CollectionProductsManager = dynamic(
  () =>
    import('@/components/stores/CollectionProductsManager').then(
      (module) => module.CollectionProductsManager,
    ),
);

export const metadata: Metadata = buildMetadata({ title: 'منتجات المجموعة', noIndex: true });

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MyStoreCollectionManagePage({ params }: Props) {
  const { id } = await params;

  return (
    <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
      <div className="mx-auto w-full max-w-5xl">
        <CollectionProductsManager collectionId={id} />
      </div>
    </Suspense>
  );
}
