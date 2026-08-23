import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CollectionProductsManager } from '@/components/stores/CollectionProductsManager';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'منتجات المجموعة', noIndex: true });

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MyStoreCollectionManagePage({ params }: Props) {
  const { id } = await params;

  return (
    <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
      <CollectionProductsManager collectionId={id} />
    </Suspense>
  );
}
