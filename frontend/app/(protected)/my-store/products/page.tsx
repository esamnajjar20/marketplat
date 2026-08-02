import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Plus, Store } from 'lucide-react';
import { MyProductsList } from '@/components/stores/MyProductsList';
import { Button } from '@/components/shared/ui/Button';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({ title: 'منتجاتي', noIndex: true });

export default function MyStoreProductsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">منتجاتي</h1>
        <div className="flex gap-2">
          <Link href={ROUTES.myStore}>
            <Button size="sm" variant="outline" className="gap-1.5"><Store className="h-4 w-4" />إعدادات المتجر</Button>
          </Link>
          <Link href={ROUTES.myStoreProductCreate}>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />منتج جديد</Button>
          </Link>
        </div>
      </div>
      <Suspense><MyProductsList /></Suspense>
    </div>
  );
}
