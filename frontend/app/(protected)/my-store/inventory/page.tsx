import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyStoreInventory } from '@/components/stores/MyStoreInventory';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'إدارة المخزون',
  noIndex: true,
});

export default function MyStoreInventoryPage() {
  return (
    <Suspense>
      <MyStoreInventory />
    </Suspense>
  );
}
