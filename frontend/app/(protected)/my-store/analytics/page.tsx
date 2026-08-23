import type { Metadata } from 'next';
import Link from 'next/link';
import { Package } from 'lucide-react';
import { MyStoreAnalytics } from '@/components/stores/MyStoreAnalytics';
import { Button } from '@/components/shared/ui/Button';
import { buildMetadata } from '@/lib/seo';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = buildMetadata({ title: 'إحصائيات المتجر', noIndex: true });

// STORE-ANALYTICS (Foundation v1): same header/back-link layout as
// my-store/promotions/page.tsx.
export default function MyStoreAnalyticsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">إحصائيات المتجر</h1>
        <Link href={ROUTES.myStoreProducts}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Package className="h-4 w-4" />منتجاتي
          </Button>
        </Link>
      </div>
      <MyStoreAnalytics />
    </div>
  );
}
