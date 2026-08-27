import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MyStoreHub } from '@/components/stores/MyStoreHub';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'لوحة المتجر', noIndex: true });

export default function MyStorePage() {
  return (
    <div className="space-y-6">
      <Suspense>
        <MyStoreHub />
      </Suspense>
    </div>
  );
}
