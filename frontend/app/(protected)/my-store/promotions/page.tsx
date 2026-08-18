import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { MyPromotionsList } from '@/components/stores/MyPromotionsList';
import { Button } from '@/components/shared/ui/Button';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({ title: 'العروض', noIndex: true });

export default function MyStorePromotionsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">العروض</h1>
        <Link href={ROUTES.myStoreProducts}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Package className="h-4 w-4" />منتجاتي
          </Button>
        </Link>
      </div>
      <Suspense><MyPromotionsList /></Suspense>
    </div>
  );
}
